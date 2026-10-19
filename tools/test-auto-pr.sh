#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-python3}"
. "$ROOT/tools/auto-pr-lib.sh"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

expect_wait() {
  if ! is_wait_error "$1"; then
    fail "expected wait error: $1"
  fi
}

expect_not_wait() {
  if is_wait_error "$1"; then
    fail "expected non-wait error: $1"
  fi
}

expect_wait "required check tests is pending"
expect_wait "mergeable is UNKNOWN"
expect_wait "merge state is UNKNOWN"
expect_wait "no required checks found"
expect_wait "no visible checks found"
expect_not_wait "no AI review marker found"
expect_not_wait "required check tests is failing"
expect_not_wait "1 unresolved review thread(s): app.js:3"

output="$(printf '%s' '{"ok":false,"review":null,"errors":["latest AI review still has 2 blocker(s)"]}' | summarize_gate)"
if [ "$output" != "$(printf '2\tlatest AI review still has 2 blocker(s)')" ]; then
  fail "blocker extraction: $output"
fi

output="$(printf '%s' '{"ok":false,"review":null,"errors":["no AI review marker found"]}' | summarize_gate)"
if [ "$output" != "$(printf 'none\tno AI review marker found')" ]; then
  fail "marker extraction: $output"
fi

output="$(printf '%s' '{"ok":true,"review":{"blockers":0},"errors":[]}' | summarize_gate)"
if [ "$output" != "$(printf '0\t')" ]; then
  fail "ok extraction: $output"
fi

printf 'auto pr tests OK\n'
