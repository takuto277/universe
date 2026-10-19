#!/usr/bin/env python3
"""Post a COMMENT review with a machine-readable AI review marker."""

import argparse
import json
import re
import subprocess
import sys

MARKER_RE = re.compile(r"<!--\s*ai-pr-review\s*(\{.*?\})\s*-->", re.S)


class ReviewError(Exception):
    pass


def run_gh(args, input_text=None):
    proc = subprocess.run(
        ["gh"] + args,
        input=input_text,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        message = proc.stderr.strip() or proc.stdout.strip() or "gh failed"
        raise ReviewError(message)
    return proc.stdout


def gh_json(args, input_text=None):
    output = run_gh(args, input_text)
    if not output.strip():
        return None
    return json.loads(output)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Post a GitHub pull request review that the merge gate can verify."
    )
    parser.add_argument("--pr", type=int, required=True, help="Pull request number")
    parser.add_argument(
        "--body-file",
        required=True,
        help="Review body file. Use - to read from stdin.",
    )
    parser.add_argument("--blockers", type=int, default=0, help="Blocker count")
    parser.add_argument("--findings", type=int, default=0, help="Finding count")
    parser.add_argument("--repo", help="OWNER/REPO. Defaults to the current repository")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the review payload without posting it",
    )
    return parser.parse_args()


def read_body(path):
    if path == "-":
        body = sys.stdin.read()
    else:
        with open(path, encoding="utf-8") as handle:
            body = handle.read()
    body = body.strip()
    if not body:
        raise ReviewError("review body is empty")
    if MARKER_RE.search(body):
        raise ReviewError("review body already contains an ai-pr-review marker")
    return body


def resolve_repo(repo):
    if repo:
        return repo
    return run_gh(
        ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]
    ).strip()


def main():
    args = parse_args()
    if args.blockers < 0 or args.findings < 0:
        raise ReviewError("blockers and findings must be zero or greater")
    if args.blockers > args.findings:
        raise ReviewError("blockers cannot exceed findings")
    repo = resolve_repo(args.repo)
    body = read_body(args.body_file)

    pull = gh_json(
        [
            "pr",
            "view",
            str(args.pr),
            "--repo",
            repo,
            "--json",
            "number,state,headRefOid,url,title",
        ]
    )
    if pull["state"] != "OPEN":
        raise ReviewError("pull request is not open")

    marker_data = {
        "version": 1,
        "head": pull["headRefOid"],
        "blockers": args.blockers,
        "findings": args.findings,
        "reviewer": "opencode",
    }
    marker = "<!-- ai-pr-review\n" + json.dumps(
        marker_data, ensure_ascii=False, separators=(",", ":")
    ) + "\n-->"
    review_body = marker + "\n\n" + body

    payload = {
        "commit_id": pull["headRefOid"],
        "body": review_body,
        "event": "COMMENT",
    }

    if args.dry_run:
        print(json.dumps({"repo": repo, "pull": pull, "payload": payload}, ensure_ascii=False, indent=2))
        return 0

    review = gh_json(
        [
            "api",
            "--method",
            "POST",
            "repos/%s/pulls/%d/reviews" % (repo, args.pr),
            "--input",
            "-",
        ],
        json.dumps(payload),
    )
    if not review or "id" not in review:
        raise ReviewError("review response did not contain an id")

    saved = gh_json(
        [
            "api",
            "repos/%s/pulls/%d/reviews/%d" % (repo, args.pr, review["id"]),
        ]
    )
    if saved.get("commit_id") != pull["headRefOid"]:
        raise ReviewError("posted review does not match the pull request head")
    if "ai-pr-review" not in (saved.get("body") or ""):
        raise ReviewError("posted review does not contain the marker")

    print(
        json.dumps(
            {
                "ok": True,
                "repo": repo,
                "pr": args.pr,
                "head": pull["headRefOid"],
                "review_id": review["id"],
                "review_url": review.get("html_url"),
                "blockers": args.blockers,
                "findings": args.findings,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ReviewError as error:
        print("error: %s" % error, file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as error:
        print("error: invalid JSON from gh: %s" % error, file=sys.stderr)
        sys.exit(1)
