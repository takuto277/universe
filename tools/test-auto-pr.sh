#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-python3}"
. "$ROOT/tools/auto-pr-lib.sh"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

expect_gate() {
  local input="$1"
  local expected="$2"
  local label="$3"
  local output
  output="$(printf '%s' "$input" | summarize_gate)"
  if [ "$output" != "$expected" ]; then
    fail "$label: [$output] != [$expected]"
  fi
}

expect_gate \
  '{"ok":false,"review":null,"waiting":false,"errors":["latest AI review still has 2 blocker(s)"]}' \
  "$(printf '2\tlatest AI review still has 2 blocker(s)\t0')" \
  "blocker extraction"

expect_gate \
  '{"ok":false,"review":null,"waiting":false,"errors":["no AI review marker found"]}' \
  "$(printf 'none\tno AI review marker found\t0')" \
  "marker extraction"

expect_gate \
  '{"ok":false,"review":null,"waiting":true,"errors":["required check tests is pending"]}' \
  "$(printf 'none\trequired check tests is pending\t1')" \
  "wait extraction"

expect_gate \
  '{"ok":true,"review":{"blockers":0},"waiting":false,"errors":[]}' \
  "$(printf '0\t\t0')" \
  "ok extraction"

expect_gate \
  '{"ok":false,"review":null,"waiting":false,"errors":["check tests is still pending","1 unresolved review thread(s)"]}' \
  "$(printf 'none\tcheck tests is still pending | 1 unresolved review thread(s)\t0')" \
  "mixed extraction"

printf 'auto pr tests OK\n'
