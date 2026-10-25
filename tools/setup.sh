#!/usr/bin/env bash
# setup.sh : 新しい Mac で universe の開発・自動化環境を確認/準備する
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${UNIVERSE_AGENT_REPO:-takuto277/universe}"
MODE="check"
WITH_AGENTS=0
RUN_VERIFY=0

usage() {
  cat <<'USAGE'
Usage: tools/setup.sh [--install] [--with-agents] [--verify]

何も指定しない場合は、必要なコマンドの確認だけを行います。

  --install      足りない gh を Homebrew で導入する（brew がある場合のみ）
  --with-agents  実装ランナー・watcher・planner の LaunchAgent を登録する
                 (UNIVERSE_AGENT_SANDBOX=seatbelt を既定で使う)
  --verify       ./tools/verify.sh も実行する
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --install) MODE="install" ;;
    --with-agents) WITH_AGENTS=1 ;;
    --verify) RUN_VERIFY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown option: %s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

fail=0
ok() { printf '  OK    %s\n' "$1"; }
bad() { printf '  MISS  %s\n' "$1"; fail=1; }
note() { printf '        %s\n' "$1"; }

printf 'universe setup (%s)\n\n' "$MODE"

printf 'OS\n'
if [ "$(uname -s)" = "Darwin" ]; then
  ok "macOS $(sw_vers -productVersion 2>/dev/null || true)"
else
  bad "macOS 以外では LaunchAgent と sandbox-exec が使えません"
fi

printf '\n基本ツール\n'
if command -v git >/dev/null 2>&1; then
  ok "git $(git --version | awk '{print $3}')"
else
  bad "git がありません (xcode-select --install)"
fi

if command -v python3 >/dev/null 2>&1; then
  if python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'; then
    ok "python3 $(python3 -V 2>&1 | awk '{print $2}')"
  else
    bad "python3 3.9 以上が必要です"
  fi
else
  bad "python3 がありません (xcode-select --install)"
fi

JSC="${JSC:-}"
if [ -n "$JSC" ]; then
  if [ -x "$JSC" ]; then
    ok "jsc ($JSC)"
  else
    bad "JSC が実行できません: $JSC"
  fi
else
  if command -v jsc >/dev/null 2>&1; then
    JSC="$(command -v jsc)"
  elif [ -x /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc ]; then
    JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
  elif [ -x /Applications/Xcode.app/Contents/Developer/usr/bin/jsc ]; then
    JSC=/Applications/Xcode.app/Contents/Developer/usr/bin/jsc
  fi
  if [ -n "$JSC" ]; then
    ok "jsc ($JSC)"
  else
    bad "jsc が見つかりません (Xcode Command Line Tools を入れてください)"
  fi
fi

if command -v sandbox-exec >/dev/null 2>&1; then
  ok "sandbox-exec"
else
  bad "sandbox-exec がありません (macOS 標準)"
fi

printf '\nGitHub / エージェント\n'
if ! command -v gh >/dev/null 2>&1; then
  note "gh がありません"
  note "Homebrew: brew install gh / 公式: https://cli.github.com/"
  if [ "$MODE" = "install" ] && command -v brew >/dev/null 2>&1; then
    note "brew install gh を実行します"
    brew install gh || note "brew install gh に失敗しました"
  fi
fi
if command -v gh >/dev/null 2>&1; then
  ok "gh $(gh --version | head -1 | awk '{print $3}')"
  if gh auth status >/dev/null 2>&1; then
    ok "gh 認証済み"
    for repo in "$REPO" ${UNIVERSE_AUTO_PR_REPO:+"$UNIVERSE_AUTO_PR_REPO"}; do
      [ -n "$repo" ] || continue
      perm="$(gh repo view "$repo" --json viewerPermission -q .viewerPermission 2>/dev/null || true)"
      case "$perm" in
        READ|TRIAGE|WRITE|MAINTAIN|ADMIN) ok "リポジトリ権限 ($repo): $perm" ;;
        *) bad "リポジトリ $repo にアクセスできません (gh repo view)" ;;
      esac
    done
  else
    bad "gh が未認証です (gh auth login)"
  fi
else
  bad "gh がありません"
fi

if command -v opencode >/dev/null 2>&1; then
  ok "opencode $(opencode --version 2>/dev/null | head -1)"
else
  bad "opencode がありません"
  note "公式の手順でインストールし、認証してください: https://opencode.ai/docs/"
fi

printf '\nエージェントの状態\n'
agent_status() {
  local label="$1" name="$2"
  local plist="$HOME/Library/LaunchAgents/com.takuto277.$label.plist"
  if launchctl print "gui/$(id -u)/com.takuto277.$label" >/dev/null 2>&1; then
    ok "$name LaunchAgent 登録済み"
  elif [ -f "$plist" ]; then
    note "$name は plist のみで未ロードです (--with-agents で再登録)"
  else
    note "$name は未登録です (--with-agents で登録)"
  fi
}
agent_status universe-agent-runner runner
agent_status universe-auto-pr watcher
agent_status universe-agent-planner planner

printf '\n自動化チェックアウト\n'
AUTO_ROOT="${UNIVERSE_AUTOMATION_ROOT:-$HOME/.local/share/universe-automation}"
if [ -e "$AUTO_ROOT/.git" ]; then
  ok "$AUTO_ROOT"
else
  note "未作成です (--with-agents で作成します)"
fi

if [ "$WITH_AGENTS" = "1" ]; then
  if [ "$fail" = "1" ]; then
    printf '\n未解決の項目があるため、エージェントの登録を中止します。\n' >&2
    exit 1
  fi
  printf '\nLaunchAgent を登録します\n'
  SANDBOX="${UNIVERSE_AGENT_SANDBOX:-seatbelt}"
  UNIVERSE_AGENT_SANDBOX="$SANDBOX" "$ROOT/tools/install-agent-runner.sh"
  UNIVERSE_AGENT_SANDBOX="$SANDBOX" "$ROOT/tools/install-auto-pr.sh"
  UNIVERSE_AGENT_SANDBOX="$SANDBOX" "$ROOT/tools/install-agent-planner.sh"
fi

if [ "$RUN_VERIFY" = "1" ]; then
  if [ "$fail" = "1" ]; then
    printf '\n未解決の項目があるため、verify を中止します。\n' >&2
    exit 1
  fi
  printf '\nverify を実行します\n'
  "$ROOT/tools/verify.sh"
fi

if [ "$fail" = "1" ]; then
  printf '\n未解決の項目があります。上の MISS を確認してください。\n' >&2
  exit 1
fi
printf '\n準備できています。\n'
