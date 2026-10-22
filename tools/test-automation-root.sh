#!/usr/bin/env bash
# test-automation-root.sh : 専用チェックアウトの作成・更新・削除を検証する
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
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
printf 'automation root tests OK\n'
