#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 信頼するチェックを先に実行し、アプリのテストは最後に回す。
# テスト JS が後続のチェックを差し替えられないようにするため。
python3 "$ROOT/tools/check_site.py"
python3 "$ROOT/tools/sync_app_dates.py" --check
python3 "$ROOT/tools/check_skills.py"
for script in \
  "$ROOT/tools/agent.sh" \
  "$ROOT/tools/experiment.sh" \
  "$ROOT/tools/setup.sh" \
  "$ROOT/tools/automation-root.sh" \
  "$ROOT/tools/automation-run.sh" \
  "$ROOT/tools/test-automation-root.sh" \
  "$ROOT/tools/test-installers.sh" \
  "$ROOT/tools/test-auto-pr-retry.sh" \
  "$ROOT/tools/install-agent-runner.sh" \
  "$ROOT/tools/install-agent-planner.sh" \
  "$ROOT/tools/install-experiment-runner.sh" \
  "$ROOT/tools/auto-pr.sh" \
  "$ROOT/tools/auto-pr-lib.sh" \
  "$ROOT/tools/install-auto-pr.sh" \
  "$ROOT/tools/test-auto-pr.sh"; do
  bash -n "$script"
done
python3 -I - "$ROOT" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
paths = sorted((root / "tools").glob("pr_*.py"))
paths += [root / "tools/agent_runner.py", root / "tools/test_agent_runner.py",
          root / "tools/check_skills.py", root / "tools/test_skills.py",
          root / "tools/playtest/playtest.py",
          root / "tools/playtest/serve.py",
          root / "tools/thumbnails/generate.py",
          root / "tools/sync_app_dates.py"]
for path in paths:
    compile(path.read_text(encoding="utf-8"), str(path), "exec")
print("pr scripts compile OK")
print("auto pr scripts syntax OK")
PY
python3 "$ROOT/tools/test_agent_runner.py"
python3 "$ROOT/tools/test_skills.py"
bash "$ROOT/tools/test-auto-pr.sh"
bash "$ROOT/tools/test-setup.sh"
bash "$ROOT/tools/test-automation-root.sh"
bash "$ROOT/tools/test-installers.sh"
bash "$ROOT/tools/test-auto-pr-retry.sh"
"$ROOT/tools/run-tests.sh"
