#!/usr/bin/env bash

summarize_gate() {
  "${PYTHON:-python3}" -c '
import json
import re
import sys

try:
    data = json.loads(sys.stdin.read())
except Exception:
    print("none\tinvalid gate output\t0\t")
    raise SystemExit
review = data.get("review") or {}
blockers = review.get("blockers")
for error in data.get("errors", []):
    match = re.search(r"latest AI review still has (\d+) blocker", error)
    if match:
        blockers = int(match.group(1))
        break
print(
    "%s\t%s\t%s\t%s"
    % (
        blockers if blockers is not None else "none",
        " | ".join(data.get("errors", [])),
        "1" if data.get("waiting") else "0",
        data.get("head") or "",
    )
)
'
}
