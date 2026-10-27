#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-python3}"
. "$ROOT/tools/auto-pr-lib.sh"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

"$PYTHON" - "$ROOT/tools/pr_gate.py" <<'PY'
import importlib.util
import sys

spec = importlib.util.spec_from_file_location("pr_gate", sys.argv[1])
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

cases = [
    ([], False),
    (["merge state is BLOCKED"], False),
    (["merge state is BLOCKED", "required check tests is pending"], True),
    (["required check tests is pending"], True),
    (["required check tests is pending", "1 unresolved review thread(s)"], False),
    (["no checks reported on the 'x' branch"], True),
    (["mergeable is UNKNOWN"], True),
    (["merge state is BLOCKED", "mergeable is UNKNOWN"], True),
]
for errors, expected in cases:
    actual = gate.wait_state(errors)
    if actual != expected:
        raise SystemExit("wait_state(%r) = %r, expected %r" % (errors, actual, expected))
PY

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
  '{"ok":false,"head":"abc","review":null,"waiting":false,"errors":["latest AI review still has 2 blocker(s)"]}' \
  "$(printf '2\tlatest AI review still has 2 blocker(s)\t0\tabc')" \
  "blocker extraction"

expect_gate \
  '{"ok":false,"head":"abc","review":null,"waiting":false,"errors":["no AI review marker found"]}' \
  "$(printf 'none\tno AI review marker found\t0\tabc')" \
  "marker extraction"

expect_gate \
  '{"ok":false,"head":"abc","review":null,"waiting":true,"errors":["required check tests is pending"]}' \
  "$(printf 'none\trequired check tests is pending\t1\tabc')" \
  "wait extraction"

expect_gate \
  '{"ok":true,"head":"abc","review":{"blockers":0},"waiting":false,"errors":[]}' \
  "$(printf '0\t\t0\tabc')" \
  "ok extraction"

expect_gate \
  '{"ok":false,"head":"abc","review":null,"waiting":false,"errors":["check tests is still pending","1 unresolved review thread(s)"]}' \
  "$(printf 'none\tcheck tests is still pending | 1 unresolved review thread(s)\t0\tabc')" \
  "mixed extraction"

expect_gate \
  'not json' \
  "$(printf 'none\tinvalid gate output\t0\t')" \
  "invalid extraction"

state_dir="$(mktemp -d "${TMPDIR:-/tmp}/auto-pr-status.XXXXXX")"
out="$(UNIVERSE_AUTO_PR_STATE_DIR="$state_dir" bash "$ROOT/tools/auto-pr.sh" --status)"
[ "$out" = "watcher last success: never" ] || fail "status before success: $out"
printf '2026-10-28T09:00:00+0900\n' >"$state_dir/last-success"
out="$(UNIVERSE_AUTO_PR_STATE_DIR="$state_dir" bash "$ROOT/tools/auto-pr.sh" --status)"
[ "$out" = "watcher last success: 2026-10-28T09:00:00+0900" ] || fail "status after success: $out"
rm -rf "$state_dir"

# レビュー用タイムアウトが子プロセスごと止めることを確認する
marker="$(mktemp "${TMPDIR:-/tmp}/auto-pr-timeout.XXXXXX")"
rm -f "$marker"
start="$(date +%s)"
set +e
run_with_timeout 1 /bin/sh -c '(sleep 2; echo alive > "$1") & wait' sh "$marker"
rc=$?
set -e
[ "$rc" -eq 124 ] || fail "timeout should return 124 (got $rc)"
[ "$(( $(date +%s) - start ))" -lt 5 ] || fail "timeout took too long"
sleep 2.5
[ ! -e "$marker" ] || fail "child process survived timeout"
rm -f "$marker"

printf 'auto pr tests OK\n'
