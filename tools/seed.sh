#!/usr/bin/env bash
# tools/seed.sh : 種の確保ツール（seed.py のラッパー）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$ROOT/tools/seed.py" "$@"
