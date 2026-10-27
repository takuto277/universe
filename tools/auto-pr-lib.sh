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

run_with_timeout() {
  local seconds="$1"
  shift
  "${PYTHON:-python3}" - "$seconds" "$@" <<'PY'
import os
import signal
import subprocess
import sys

try:
    limit = float(sys.argv[1])
    argv = sys.argv[2:]
    proc = subprocess.Popen(argv, start_new_session=True)
except (FileNotFoundError, OSError, ValueError) as exc:
    print(str(exc), file=sys.stderr)
    raise SystemExit(127)
try:
    code = proc.wait(timeout=limit)
except subprocess.TimeoutExpired:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except OSError:
        pass
    try:
        code = proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except OSError:
            pass
        try:
            code = proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            code = 124
    raise SystemExit(124)
raise SystemExit(code if code >= 0 else 128 - code)
PY
}
