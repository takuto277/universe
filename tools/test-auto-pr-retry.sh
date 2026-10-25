#!/usr/bin/env bash
# test-auto-pr-retry.sh : pending findings の再試行ガードを検証する
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/universe-auto-pr-retry.XXXXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/state/findings-pending" "$TMP/tmp" "$TMP/runner" "$TMP/home"
for name in gh opencode git; do
  printf '#!/bin/sh\nexit 0\n' >"$TMP/bin/$name"
  chmod +x "$TMP/bin/$name"
done
cat >"$TMP/bin/python" <<SH
#!/bin/sh
printf '%s\\n' "\$*" >>"$TMP/python.log"
exit 0
SH
chmod +x "$TMP/bin/python"

base_env=(
  HOME="$TMP/home"
  TMPDIR="$TMP/tmp"
  UNIVERSE_AUTO_PR_STATE_DIR="$TMP/state"
  UNIVERSE_AUTO_PR_LOG="$TMP/log"
  UNIVERSE_AGENT_STATE_DIR="$TMP/runner"
  GH_BIN="$TMP/bin/gh"
  OPENCODE_BIN="$TMP/bin/opencode"
  PYTHON_BIN="$TMP/bin/python"
  GIT_BIN="$TMP/bin/git"
)
run_arg() { env "${base_env[@]}" /bin/bash "$ROOT/tools/auto-pr.sh" "$@"; }
run_env() { env "${base_env[@]}" "$@" /bin/bash "$ROOT/tools/auto-pr.sh"; }
reset_log() { rm -f "$TMP/python.log"; }
called() { [ -f "$TMP/python.log" ] && grep -q "findings --pr 42" "$TMP/python.log"; }

pending="$TMP/state/findings-pending/42"
touch "$pending"

reset_log
run_arg --dry-run
if called; then printf 'dry-run must not retry findings\n' >&2; exit 1; fi

reset_log
run_env UNIVERSE_AUTO_PR_CREATE_ISSUES=0
if called; then printf 'disabled findings must not retry\n' >&2; exit 1; fi

touch "$TMP/runner/pause"
reset_log
run_arg
if called; then printf 'paused runner must not retry findings\n' >&2; exit 1; fi
rm -f "$TMP/runner/pause"

reset_log
run_arg
if called; then printf 'recent pending must wait 5 minutes\n' >&2; exit 1; fi

touch -t "$(date -v-10M '+%Y%m%d%H%M')" "$pending"
reset_log
run_arg
if ! called; then printf 'old pending should be retried\n' >&2; exit 1; fi
[ ! -f "$pending" ]

printf 'auto pr retry tests OK\n'
