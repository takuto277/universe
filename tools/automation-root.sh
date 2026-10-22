#!/usr/bin/env bash
# automation-root.sh : LaunchAgent 用の main 追従チェックアウトを管理する
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${UNIVERSE_AUTOMATION_ROOT:-$HOME/.local/share/universe-automation}"
BASE="${UNIVERSE_AGENT_BASE:-main}"

usage() {
  cat <<'USAGE'
Usage: tools/automation-root.sh [ensure|update|status|remove]

LaunchAgent が使う main 追従の専用チェックアウトを管理します。
パスは UNIVERSE_AUTOMATION_ROOT（既定: ~/.local/share/universe-automation）。

  ensure/update  作成または origin/main へ更新（既定）
  status         パスと HEAD を表示
  remove         worktree を削除
USAGE
}

cmd="${1:-ensure}"
case "$cmd" in
  -h|--help) usage; exit 0 ;;
  ensure|update|status|remove) ;;
  *) printf 'unknown command: %s\n' "$cmd" >&2; usage >&2; exit 2 ;;
esac

if [ -e "$DEST" ] && [ ! -e "$DEST/.git" ]; then
  printf 'UNIVERSE_AUTOMATION_ROOT が git チェックアウトではありません: %s\n' "$DEST" >&2
  exit 1
fi

if [ -e "$DEST/.git" ]; then
  source_common="$(git -C "$SOURCE_ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  dest_common="$(git -C "$DEST" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [ -z "$dest_common" ] || [ "$dest_common" != "$source_common" ]; then
    printf 'UNIVERSE_AUTOMATION_ROOT はこのリポジトリの worktree ではありません: %s\n' "$DEST" >&2
    exit 1
  fi
  if git -C "$DEST" symbolic-ref -q HEAD >/dev/null 2>&1; then
    printf 'UNIVERSE_AUTOMATION_ROOT は detached HEAD の worktree にしてください（ブランチのチェックアウトは更新しません）: %s\n' "$DEST" >&2
    exit 1
  fi
fi

case "$cmd" in
  status)
    printf 'path: %s\n' "$DEST"
    if [ -e "$DEST/.git" ]; then
      git -C "$DEST" log -1 --format='head: %h %s'
      printf 'base: %s\n' "$BASE"
    else
      printf 'state: not created\n'
    fi
    ;;
  remove)
    if [ -e "$DEST/.git" ]; then
      common="$(git -C "$DEST" rev-parse --path-format=absolute --git-common-dir)"
      git --git-dir="$common" worktree remove --force "$DEST"
      printf 'removed: %s\n' "$DEST"
    else
      printf 'not found: %s\n' "$DEST"
    fi
    ;;
  ensure|update)
    mkdir -p "$(dirname "$DEST")"
    if [ -e "$DEST/.git" ]; then
      git -C "$DEST" fetch --quiet origin "$BASE"
      git -C "$DEST" reset --hard --quiet "origin/$BASE"
    else
      git -C "$SOURCE_ROOT" fetch --quiet origin "$BASE"
      git -C "$SOURCE_ROOT" worktree add --detach "$DEST" "origin/$BASE"
    fi
    printf '%s\n' "$DEST"
    ;;
esac
