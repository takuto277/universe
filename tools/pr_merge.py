#!/usr/bin/env python3
"""Run the merge gate and squash-merge a pull request."""

import argparse
import json
import os
import subprocess
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GATE = os.path.join(SCRIPT_DIR, "pr_gate.py")


class MergeError(Exception):
    pass


def run(command, input_text=None):
    return subprocess.run(
        command,
        input=input_text,
        text=True,
        capture_output=True,
    )


def run_gh(args, input_text=None):
    return run(["gh"] + args, input_text)


def gh_json(args):
    proc = run_gh(args)
    if proc.returncode != 0:
        message = proc.stderr.strip() or proc.stdout.strip() or "gh failed"
        raise MergeError(message)
    if not proc.stdout.strip():
        raise MergeError("gh returned no JSON")
    return json.loads(proc.stdout)


def gate(args):
    command = [
        sys.executable,
        GATE,
        "--pr",
        str(args.pr),
        "--base",
        args.base,
        "--wait",
        str(args.wait),
    ]
    if args.repo:
        command.extend(["--repo", args.repo])
    for name in args.ignore_check:
        command.extend(["--ignore-check", name])
    proc = run(command)
    output = proc.stdout.strip()
    if not output:
        raise MergeError(proc.stderr.strip() or "gate returned no output")
    try:
        result = json.loads(output.splitlines()[-1])
    except json.JSONDecodeError:
        raise MergeError("gate returned invalid JSON: %s" % output)
    if proc.returncode != 0 or not result.get("ok"):
        print(json.dumps(result, ensure_ascii=False), file=sys.stderr)
        raise MergeError("merge gate failed")
    return result


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run the five-point gate and squash-merge a pull request."
    )
    parser.add_argument("--pr", type=int, required=True, help="Pull request number")
    parser.add_argument("--repo", help="OWNER/REPO. Defaults to the current repository")
    parser.add_argument("--base", default="main", help="Required base branch")
    parser.add_argument(
        "--wait",
        type=int,
        default=300,
        help="Seconds to wait for pending checks",
    )
    parser.add_argument(
        "--ignore-check",
        action="append",
        default=["merge-gate", "CodeRabbit"],
        help="Check name to ignore. May be repeated.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    repo = args.repo
    if not repo:
        repo = run_gh(
            ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]
        ).stdout.strip()
    if not repo:
        raise MergeError("cannot resolve the repository")

    first = gate(args)

    pull = gh_json(
        [
            "pr",
            "view",
            str(args.pr),
            "--repo",
            repo,
            "--json",
            "number,state,isDraft,headRefOid,url",
        ]
    )
    if pull.get("isDraft"):
        ready = run_gh(["pr", "ready", str(args.pr), "--repo", repo])
        if ready.returncode != 0:
            raise MergeError(ready.stderr.strip() or "failed to mark the pull request ready")
        time.sleep(2)

    second = gate(args)
    if second.get("head") != first.get("head"):
        raise MergeError("pull request head changed after the first gate")

    merge = run_gh(
        [
            "pr",
            "merge",
            str(args.pr),
            "--repo",
            repo,
            "--squash",
            "--match-head-commit",
            second["head"],
        ]
    )
    if merge.returncode != 0:
        raise MergeError(merge.stderr.strip() or merge.stdout.strip() or "merge failed")

    merged = gh_json(
        [
            "pr",
            "view",
            str(args.pr),
            "--repo",
            repo,
            "--json",
            "number,state,mergedAt,mergeCommit,url",
        ]
    )
    if merged.get("state") != "MERGED":
        raise MergeError("pull request did not reach MERGED state")

    print(
        json.dumps(
            {
                "ok": True,
                "repo": repo,
                "pr": args.pr,
                "head": second["head"],
                "review_id": second.get("review", {}).get("review_id"),
                "merge_commit": (merged.get("mergeCommit") or {}).get("oid"),
                "merged_at": merged.get("mergedAt"),
                "url": merged.get("url"),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except MergeError as error:
        print("error: %s" % error, file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as error:
        print("error: invalid JSON from gh: %s" % error, file=sys.stderr)
        sys.exit(1)
