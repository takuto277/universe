#!/usr/bin/env bash
# automation-run.sh : 専用チェックアウトを更新してからツールを実行する
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${UNIVERSE_AGENT_BASE:-${UNIVERSE_AUTO_PR_BASE:-main}}"
LOG="${UNIVERSE_AUTOMATION_UPDATE_LOG:-$HOME/Library/Logs/universe-automation-update.log}"

if [ "$#" -lt 1 ]; then
  printf 'usage: automation-run.sh <script> [args...]\n' >&2
  exit 2
fi

mkdir -p "$(dirname "$LOG")"
if [ -f "$LOG" ] && [ "$(wc -c <"$LOG" | tr -d ' ')" -gt 1048576 ]; then
  mv "$LOG" "$LOG.1"
fi
LOCK="${TMPDIR:-/tmp}/universe-automation-update.lock"
if [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
  rmdir "$LOCK" 2>/dev/null || true
fi
{
  if mkdir "$LOCK" 2>/dev/null; then
    trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
    managed=0
    if [ -f "$ROOT/.universe-automation-root" ]; then
      managed=1
    else
      default_root="$HOME/.local/share/universe-automation"
      if [ "$(cd "$ROOT" && pwd -P)" = "$(cd "$default_root" 2>/dev/null && pwd -P)" ]; then
        printf 'managed\n' >"$ROOT/.universe-automation-root"
        managed=1
      fi
    fi
    if [ "$managed" != "1" ]; then
      printf '%s unmanaged worktree; skip update\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
    else
      printf '%s update start\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
      if git -C "$ROOT" fetch --quiet origin "$BASE"; then
        if git -C "$ROOT" reset --hard --quiet "origin/$BASE"; then
          printf '%s updated to %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
            "$(git -C "$ROOT" rev-parse --short HEAD)"
        else
          printf '%s reset failed; continue with current checkout\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
        fi
      else
        printf '%s fetch failed; continue with current checkout\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
      fi
    fi
    rmdir "$LOCK" 2>/dev/null || true
    trap - EXIT
  else
    printf '%s update skipped (another run holds the lock)\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
  fi
} >>"$LOG" 2>&1

exec "$ROOT/tools/$1" "${@:2}"
