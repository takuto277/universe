#!/usr/bin/env bash
# experiment.sh : 実験Issueを隔離ブランチで実装し、プレビューへ回す
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$#" -ne 1 ]; then
  printf 'usage: tools/experiment.sh <issue-number>\n' >&2
  exit 2
fi

case "$1" in
  *[!0-9]*|'')
    printf 'issue number must be an integer: %s\n' "$1" >&2
    exit 2
    ;;
esac

UNIVERSE_AGENT_BRANCH_PREFIX=experiment/ exec "$ROOT/tools/agent.sh" run --issue "$1"
