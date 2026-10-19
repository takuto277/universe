#!/usr/bin/env python3
"""Evaluate the five-point AI merge gate for a pull request."""

import argparse
import json
import re
import subprocess
import sys
import time

MARKER_RE = re.compile(r"<!--\s*ai-pr-review\s*(\{.*?\})\s*-->", re.S)
UI_MARKER_RE = re.compile(r"<!--\s*ui-evidence:\s*([0-9a-f]{7,40})\s*-->")
ALLOWED_MERGE_STATES = {"CLEAN", "BEHIND", "HAS_HOOKS", "DRAFT"}
FAIL_MERGE_STATES = {"DIRTY", "CONFLICTING", "UNKNOWN", "BLOCKED"}
FAIL_CHECK_BUCKETS = {"fail", "cancel"}
PENDING_CHECK_BUCKETS = {"pending"}
PASS_CHECK_BUCKETS = {"pass", "skipping"}


class GateError(Exception):
    pass


def run_gh(args, input_text=None):
    return subprocess.run(
        ["gh"] + args,
        input=input_text,
        text=True,
        capture_output=True,
    )


def gh_json(args, input_text=None):
    proc = run_gh(args, input_text)
    if proc.returncode != 0:
        message = proc.stderr.strip() or proc.stdout.strip() or "gh failed"
        raise GateError(message)
    if not proc.stdout.strip():
        return None
    return json.loads(proc.stdout)


def flatten_pages(value):
    if not isinstance(value, list):
        return []
    if value and all(isinstance(item, list) for item in value):
        return [item for page in value for item in page]
    return value


def get_repo(args):
    if args.repo:
        return args.repo
    return run_gh(
        ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]
    ).stdout.strip()


def get_pull(repo, number, attempts=6):
    last = None
    for _ in range(attempts):
        pull = gh_json(
            [
                "pr",
                "view",
                str(number),
                "--repo",
                repo,
                "--json",
                "number,title,state,isDraft,headRefOid,baseRefName,mergeable,"
                "mergeStateStatus,reviewDecision,labels,url",
            ]
        )
        last = pull
        if pull.get("mergeable") != "UNKNOWN" and pull.get("mergeStateStatus") != "UNKNOWN":
            return pull
        time.sleep(2)
    return last


def get_checks(repo, number, required, ignored):
    args = ["pr", "checks", str(number), "--repo", repo]
    if required:
        args.append("--required")
    args.extend(["--json", "name,state,bucket,link"])
    proc = run_gh(args)
    if not proc.stdout.strip():
        message = proc.stderr.strip() or "no checks returned"
        raise GateError(message)
    checks = json.loads(proc.stdout)
    return [check for check in checks if check.get("name") not in ignored]


def wait_for_checks(repo, number, ignored, timeout):
    if timeout <= 0:
        return
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            checks = get_checks(repo, number, False, ignored)
        except GateError as error:
            if "no checks" not in str(error):
                raise
            time.sleep(5)
            continue
        if not any(check.get("bucket") in PENDING_CHECK_BUCKETS for check in checks):
            return
        time.sleep(5)


def check_ci(repo, number, ignored):
    required = get_checks(repo, number, True, ignored)
    if not required:
        raise GateError("no required checks found")

    for check in required:
        if check.get("bucket") != "pass":
            raise GateError(
                "required check %s is %s" % (check.get("name"), check.get("bucket"))
            )

    visible = get_checks(repo, number, False, ignored)
    if not visible:
        raise GateError("no visible checks found")

    for check in visible:
        bucket = check.get("bucket")
        name = check.get("name")
        if bucket in FAIL_CHECK_BUCKETS:
            raise GateError("check %s failed (%s)" % (name, bucket))
        if bucket in PENDING_CHECK_BUCKETS:
            raise GateError("check %s is still pending" % name)
        if bucket not in PASS_CHECK_BUCKETS:
            raise GateError("check %s has an unreadable state: %s" % (name, bucket))

    return {
        "required": [check.get("name") for check in required],
        "visible": [check.get("name") for check in visible],
    }


def get_reviews(repo, number):
    pages = gh_json(
        [
            "api",
            "--paginate",
            "--slurp",
            "repos/%s/pulls/%d/reviews" % (repo, number),
        ]
    )
    return flatten_pages(pages)


def parse_marker(body):
    match = MARKER_RE.search(body or "")
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def check_review(repo, number, head):
    proc = run_gh(["api", "user", "--jq", ".login"])
    login = proc.stdout.strip()
    if proc.returncode != 0 or not login:
        raise GateError("cannot resolve the authenticated GitHub user")

    reviews = get_reviews(repo, number)
    marker_reviews = []
    for review in reviews:
        if review.get("user", {}).get("login") != login:
            continue
        marker = parse_marker(review.get("body"))
        if marker is None:
            continue
        marker_reviews.append((review, marker))

    if not marker_reviews:
        raise GateError("no AI review marker found")

    marker_reviews.sort(
        key=lambda pair: (pair[0].get("submitted_at") or "", pair[0].get("id") or 0)
    )
    review, marker = marker_reviews[-1]

    if review.get("commit_id") != head:
        raise GateError(
            "latest AI review covers %s, not the current head %s"
            % (review.get("commit_id"), head)
        )
    if marker.get("version") != 1:
        raise GateError("unsupported AI review marker version")
    if marker.get("head") != head:
        raise GateError("AI review marker head does not match the current head")
    if review.get("state") != "COMMENTED":
        raise GateError("AI review must be a COMMENT review")
    if marker.get("blockers") != 0:
        raise GateError("latest AI review still has %s blocker(s)" % marker.get("blockers"))

    return {
        "login": login,
        "review_id": review.get("id"),
        "review_url": review.get("html_url"),
        "blockers": marker.get("blockers"),
        "findings": marker.get("findings"),
    }


def check_threads(repo, number):
    owner, name = repo.split("/", 1)
    query = (
        "query($owner:String!,$name:String!,$number:Int!,$after:String){"
        "repository(owner:$owner,name:$name){pullRequest(number:$number){"
        "reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor}"
        "nodes{id isResolved isOutdated path line "
        "comments(first:1){nodes{author{login} body}}}}}}}"
    )
    unresolved = []
    after = None
    while True:
        args = [
            "api",
            "graphql",
            "-f",
            "query=" + query,
            "-F",
            "owner=" + owner,
            "-F",
            "name=" + name,
            "-F",
            "number=%d" % number,
        ]
        if after:
            args.extend(["-f", "after=" + after])
        data = gh_json(args)
        try:
            threads = data["data"]["repository"]["pullRequest"]["reviewThreads"]
        except (KeyError, TypeError):
            raise GateError("cannot read review threads: %s" % json.dumps(data, ensure_ascii=False))
        for thread in threads["nodes"]:
            if not thread.get("isResolved"):
                unresolved.append(thread)
        page = threads["pageInfo"]
        if not page.get("hasNextPage"):
            break
        after = page.get("endCursor")
        if not after:
            raise GateError("review thread pagination returned no cursor")

    if unresolved:
        sample = ", ".join(
            "%s:%s" % (thread.get("path") or "?", thread.get("line") or "?")
            for thread in unresolved[:5]
        )
        raise GateError(
            "%d unresolved review thread(s): %s" % (len(unresolved), sample)
        )
    return 0


def check_ui_evidence(repo, number, head, labels, login):
    if "ui-evidence" not in labels:
        return False

    pages = gh_json(
        [
            "api",
            "--paginate",
            "--slurp",
            "repos/%s/issues/%d/comments" % (repo, number),
        ]
    )
    comments = flatten_pages(pages)
    for comment in comments:
        if comment.get("user", {}).get("login") != login:
            continue
        match = UI_MARKER_RE.search(comment.get("body") or "")
        if match and head.startswith(match.group(1)):
            return True
    raise GateError("ui-evidence label requires an evidence comment for the current head")


def evaluate(args):
    repo = get_repo(args)
    pull = get_pull(repo, args.pr)
    ignored = set(args.ignore_check)

    if args.wait > 0:
        wait_for_checks(repo, args.pr, ignored, args.wait)
        pull = get_pull(repo, args.pr)

    head = pull["headRefOid"]
    labels = {label.get("name") for label in pull.get("labels", [])}
    errors = []
    if pull.get("state") != "OPEN":
        errors.append("pull request is not open")
    if pull.get("baseRefName") != args.base:
        errors.append("base branch is %s, expected %s" % (pull.get("baseRefName"), args.base))
    if pull.get("reviewDecision") == "CHANGES_REQUESTED":
        errors.append("pull request still has requested changes")

    mergeable = pull.get("mergeable")
    merge_state = pull.get("mergeStateStatus")
    if mergeable != "MERGEABLE":
        errors.append("mergeable is %s" % mergeable)
    if merge_state in FAIL_MERGE_STATES:
        errors.append("merge state is %s" % merge_state)
    elif merge_state not in ALLOWED_MERGE_STATES:
        errors.append("merge state is not allowed: %s" % merge_state)

    ci = None
    review = None
    try:
        ci = check_ci(repo, args.pr, ignored)
    except GateError as error:
        errors.append(str(error))

    try:
        review = check_review(repo, args.pr, head)
    except GateError as error:
        errors.append(str(error))

    try:
        unresolved = check_threads(repo, args.pr)
    except GateError as error:
        errors.append(str(error))
        unresolved = None

    ui_evidence = False
    try:
        ui_evidence = check_ui_evidence(
            repo, args.pr, head, labels, review["login"] if review else ""
        )
    except GateError as error:
        errors.append(str(error))

    result = {
        "ok": not errors,
        "repo": repo,
        "pr": args.pr,
        "head": head,
        "mergeable": mergeable,
        "merge_state": merge_state,
        "is_draft": pull.get("isDraft"),
        "ci": ci,
        "review": review,
        "unresolved_threads": unresolved,
        "ui_evidence": ui_evidence,
        "errors": errors,
    }
    return result


def parse_args():
    parser = argparse.ArgumentParser(
        description="Check the five-point merge gate for a pull request."
    )
    parser.add_argument("--pr", type=int, required=True, help="Pull request number")
    parser.add_argument("--repo", help="OWNER/REPO. Defaults to the current repository")
    parser.add_argument("--base", default="main", help="Required base branch")
    parser.add_argument(
        "--wait",
        type=int,
        default=0,
        help="Seconds to wait for pending checks before evaluating",
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
    try:
        result = evaluate(args)
    except (GateError, json.JSONDecodeError) as error:
        result = {
            "ok": False,
            "repo": args.repo,
            "pr": args.pr,
            "errors": [str(error)],
        }
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
