#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/tools/run-tests.sh"
python3 "$ROOT/tools/check_site.py"
python3 - "$ROOT" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for path in sorted((root / "tools").glob("pr_*.py")):
    compile(path.read_text(encoding="utf-8"), str(path), "exec")
print("pr scripts compile OK")
PY
