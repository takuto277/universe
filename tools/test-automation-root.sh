#!/usr/bin/env bash
# test-automation-root.sh : 専用チェックアウトの作成・更新・削除を検証する
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/universe-automation-test.XXXXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT

git init -q -b main "$TMP/remote.git" --bare
git init -q -b main "$TMP/work"
git -C "$TMP/work" config user.name test
git -C "$TMP/work" config user.email test@example.com
git -C "$TMP/work" remote add origin "$TMP/remote.git"
printf 'one\n' >"$TMP/work/value.txt"
git -C "$TMP/work" add value.txt
git -C "$TMP/work" commit -qm one
git -C "$TMP/work" push -q origin main
mkdir -p "$TMP/work/tools"
cp "$ROOT/tools/automation-root.sh" "$TMP/work/tools/"

AUTO="$TMP/auto"
UNIVERSE_AUTOMATION_ROOT="$AUTO" UNIVERSE_AGENT_BASE=main \
  bash "$TMP/work/tools/automation-root.sh" ensure >/dev/null
[ "$(cat "$AUTO/value.txt")" = "one" ]
[ -f "$AUTO/.universe-automation-root" ]

# 手動で消しても worktree 登録を prune して再作成できる
rm -rf "$AUTO"
UNIVERSE_AUTOMATION_ROOT="$AUTO" UNIVERSE_AGENT_BASE=main \
  bash "$TMP/work/tools/automation-root.sh" ensure >/dev/null
[ "$(cat "$AUTO/value.txt")" = "one" ]

printf 'two\n' >"$TMP/work/value.txt"
git -C "$TMP/work" commit -qam two
git -C "$TMP/work" push -q origin main
UNIVERSE_AUTOMATION_ROOT="$AUTO" UNIVERSE_AGENT_BASE=main \
  bash "$TMP/work/tools/automation-root.sh" ensure >/dev/null
[ "$(cat "$AUTO/value.txt")" = "two" ]

status_out="$(UNIVERSE_AUTOMATION_ROOT="$AUTO" bash "$TMP/work/tools/automation-root.sh" status)"
case "$status_out" in *"head:"*) ;; *) printf 'status output is missing head: %s\n' "$status_out" >&2; exit 1 ;; esac

PRINT_HOME="$TMP/print-home"
mkdir -p "$PRINT_HOME"
print_out="$(HOME="$PRINT_HOME" UNIVERSE_AUTOMATION_ROOT="$AUTO" bash "$ROOT/tools/install-agent-runner.sh" --print)"
case "$print_out" in *"$AUTO/tools/automation-run.sh"*) ;; *) printf 'runner plist does not use automation root\n' >&2; exit 1 ;; esac
print_out="$(HOME="$PRINT_HOME" UNIVERSE_AUTOMATION_ROOT="$AUTO" bash "$ROOT/tools/install-auto-pr.sh" --print)"
case "$print_out" in *"$AUTO/tools/automation-run.sh"*) ;; *) printf 'auto-pr plist does not use automation root\n' >&2; exit 1 ;; esac
print_out="$(HOME="$PRINT_HOME" UNIVERSE_AUTOMATION_ROOT="$AUTO" bash "$ROOT/tools/install-agent-planner.sh" --print)"
case "$print_out" in *"$AUTO/tools/automation-run.sh"*) ;; *) printf 'planner plist does not use automation root\n' >&2; exit 1 ;; esac

if [ -d "$PRINT_HOME/Library/LaunchAgents" ] && [ -n "$(ls -A "$PRINT_HOME/Library/LaunchAgents")" ]; then
  printf 'installer --print must not write plists\n' >&2
  exit 1
fi

UNIVERSE_AUTOMATION_ROOT="$AUTO" bash "$TMP/work/tools/automation-root.sh" remove >/dev/null
[ ! -e "$AUTO" ]
git -C "$TMP/work" worktree add -q -b other "$TMP/other" main
printf 'managed\n' >"$TMP/other/.universe-automation-root"
err="$(UNIVERSE_AUTOMATION_ROOT="$TMP/other" bash "$TMP/work/tools/automation-root.sh" ensure 2>&1)" && {
  printf 'branch checkout should be rejected\n' >&2; exit 1;
}
case "$err" in *"detached HEAD"*) ;; *) printf 'branch rejection should mention detached HEAD: %s\n' "$err" >&2; exit 1 ;; esac
git -C "$TMP/work" worktree remove --force "$TMP/other"

git -C "$TMP/work" worktree add -q --detach "$TMP/other-detached" main
if UNIVERSE_AUTOMATION_ROOT="$TMP/other-detached" bash "$TMP/work/tools/automation-root.sh" ensure >/dev/null 2>&1; then
  printf 'unmanaged detached worktree should be rejected\n' >&2
  exit 1
fi
status_out="$(UNIVERSE_AUTOMATION_ROOT="$TMP/other-detached" bash "$TMP/work/tools/automation-root.sh" status)"
case "$status_out" in *"path: $TMP/other-detached"*) ;; *) printf 'status should work for unmanaged worktree\n' >&2; exit 1 ;; esac
UNIVERSE_AUTOMATION_ROOT="$TMP/other-detached" bash "$TMP/work/tools/automation-root.sh" remove >/dev/null
[ ! -e "$TMP/other-detached" ]

printf 'three\n' >"$TMP/work/value.txt"
git -C "$TMP/work" commit -qam three
git -C "$TMP/work" push -q origin main
DEFAULT_HOME="$TMP/default-home"
DEFAULT_AUTO="$DEFAULT_HOME/.local/share/universe-automation"
mkdir -p "$(dirname "$DEFAULT_AUTO")"
git -C "$TMP/work" worktree add -q --detach "$DEFAULT_AUTO" main~1
mkdir -p "$DEFAULT_AUTO/tools"
cp "$ROOT/tools/automation-run.sh" "$DEFAULT_AUTO/tools/"
cat >"$DEFAULT_AUTO/tools/hello.sh" <<'SH'
#!/bin/sh
echo hello
SH
chmod +x "$DEFAULT_AUTO/tools/hello.sh"
out="$(HOME="$DEFAULT_HOME" bash "$DEFAULT_AUTO/tools/automation-run.sh" hello.sh)"
[ "$out" = "hello" ]
[ "$(cat "$DEFAULT_AUTO/value.txt")" = "three" ]
[ -f "$DEFAULT_AUTO/.universe-automation-root" ]
rm -f "$DEFAULT_AUTO/.universe-automation-root"
HOME="$DEFAULT_HOME" bash "$TMP/work/tools/automation-root.sh" ensure >/dev/null
[ -f "$DEFAULT_AUTO/.universe-automation-root" ]

# fetch 失敗時は現在の版で続行し、ログをローテーションする
git -C "$DEFAULT_AUTO" remote set-url origin "$TMP/missing.git"
run_log="$TMP/automation-update.log"
out="$(HOME="$DEFAULT_HOME" UNIVERSE_AUTOMATION_UPDATE_LOG="$run_log" \
  bash "$DEFAULT_AUTO/tools/automation-run.sh" hello.sh)"
[ "$out" = "hello" ]
grep -q "fetch failed; continue with current checkout" "$run_log"
python3 -c 'print("x" * 1100000)' >"$run_log"
out="$(HOME="$DEFAULT_HOME" UNIVERSE_AUTOMATION_UPDATE_LOG="$run_log" \
  bash "$DEFAULT_AUTO/tools/automation-run.sh" hello.sh)"
[ "$out" = "hello" ]
[ -f "$run_log.1" ]

HOME="$DEFAULT_HOME" bash "$TMP/work/tools/automation-root.sh" remove >/dev/null

printf 'automation root tests OK\n'
