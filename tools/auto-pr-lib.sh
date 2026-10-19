#!/usr/bin/env bash

is_wait_error() {
  case "$1" in
    *" is pending"*|*"mergeable is UNKNOWN"*|*"merge state is UNKNOWN"*|*"merge state is not allowed: UNKNOWN"*|*"no required checks found"*|*"no visible checks found"*|*"no checks returned"*) return 0 ;;
  esac
  return 1
}

summarize_gate() {
  "${PYTHON:-python3}" -c '
import json
import re
import sys

try:
    data = json.loads(sys.stdin.read())
except Exception:
    print("none\tinvalid gate output")
    raise SystemExit
review = data.get("review") or {}
blockers = review.get("blockers")
for error in data.get("errors", []):
    match = re.search(r"latest AI review still has (\d+) blocker", error)
    if match:
        blockers = int(match.group(1))
        break
print("%s\t%s" % (blockers if blockers is not None else "none", " | ".join(data.get("errors", []))))
'
}
