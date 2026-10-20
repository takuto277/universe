#!/usr/bin/env bash
# agent.sh : 無人実装ランナーの操作入口
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$ROOT/tools/agent_runner.py" "$@"
