#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/tools/run-tests.sh"
python3 "$ROOT/tools/check_site.py"
