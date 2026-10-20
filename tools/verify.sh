#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/tools/run-tests.sh"
python3 "$ROOT/tools/check_site.py"
for script in \
  "$ROOT/tools/agent.sh" \
  "$ROOT/tools/install-agent-runner.sh"; do
  bash -n "$script"
done
python3 - "$ROOT" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
paths = sorted((root / "tools").glob("pr_*.py"))
paths += [root / "tools/agent_runner.py", root / "tools/test_agent_runner.py"]
for path in paths:
    compile(path.read_text(encoding="utf-8"), str(path), "exec")
print("pr scripts compile OK")
PY
python3 "$ROOT/tools/test_agent_runner.py"
