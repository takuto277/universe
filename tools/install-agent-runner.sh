#!/usr/bin/env bash
# install-agent-runner.sh : 無人実装ランナーを LaunchAgent に登録する
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.takuto277.universe-agent-runner"
DOMAIN="gui/$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
REPO="${UNIVERSE_AGENT_REPO:-takuto277/universe}"
BASE="${UNIVERSE_AGENT_BASE:-main}"
MODEL="${UNIVERSE_AGENT_MODEL:-opencode/deepseek-v4.1-flash-free}"
SANDBOX="${UNIVERSE_AGENT_SANDBOX:-none}"
INTERVAL="${UNIVERSE_AGENT_INTERVAL:-120}"

usage() {
  cat <<'EOF'
Usage: tools/install-agent-runner.sh [--print|--uninstall|--status]

Installs a macOS LaunchAgent that runs tools/agent.sh run every
UNIVERSE_AGENT_INTERVAL seconds (default 120).
The runner only implements issues labeled "agent:ready" and opens PRs;
review and merge remain the job of the five-point gate / auto-pr watcher.

Pause:
  tools/agent.sh pause
  tools/agent.sh resume

Environment for the installed job:
  UNIVERSE_AGENT_REPO, UNIVERSE_AGENT_BASE, UNIVERSE_AGENT_MODEL,
  UNIVERSE_AGENT_SANDBOX (none|seatbelt)
EOF
}

case "${1:-}" in
  --uninstall)
    launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    printf 'uninstalled: %s\n' "$LABEL"
    exit 0
    ;;
  --status)
    launchctl print "$DOMAIN/$LABEL" 2>&1 || true
    exit 0
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  --print)
    PRINT_ONLY=1
    ;;
  '')
    ;;
  *)
    printf 'unknown option: %s\n' "$1" >&2
    usage >&2
    exit 2
    ;;
esac

PRINT_ONLY="${PRINT_ONLY:-0}"

case "$INTERVAL" in
  ''|*[!0-9]*)
    printf 'UNIVERSE_AGENT_INTERVAL must be a positive integer: %s\n' "$INTERVAL" >&2
    exit 2
    ;;
esac
if [ "$INTERVAL" -le 0 ]; then
  printf 'UNIVERSE_AGENT_INTERVAL must be a positive integer: %s\n' "$INTERVAL" >&2
  exit 2
fi

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

PLIST_LABEL="$(xml_escape "$LABEL")"
PLIST_ROOT="$(xml_escape "$ROOT")"
PLIST_HOME="$(xml_escape "$HOME")"
PLIST_LOG_DIR="$(xml_escape "$LOG_DIR")"
PLIST_MODEL="$(xml_escape "$MODEL")"
PLIST_SANDBOX="$(xml_escape "$SANDBOX")"
PLIST_REPO="$(xml_escape "$REPO")"
PLIST_BASE="$(xml_escape "$BASE")"
PLIST_INTERVAL="$(xml_escape "$INTERVAL")"

plist_body() {
cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PLIST_ROOT/tools/agent.sh</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PLIST_ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$PLIST_HOME/.opencode/bin:$PLIST_HOME/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>LANG</key>
    <string>ja_JP.UTF-8</string>
    <key>UNIVERSE_AGENT_MODEL</key>
    <string>$PLIST_MODEL</string>
    <key>UNIVERSE_AGENT_SANDBOX</key>
    <string>$PLIST_SANDBOX</string>
    <key>UNIVERSE_AGENT_REPO</key>
    <string>$PLIST_REPO</string>
    <key>UNIVERSE_AGENT_BASE</key>
    <string>$PLIST_BASE</string>
  </dict>
  <key>StartInterval</key>
  <integer>$PLIST_INTERVAL</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>$PLIST_LOG_DIR/universe-agent-runner.launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$PLIST_LOG_DIR/universe-agent-runner.error.log</string>
</dict>
</plist>
EOF
}

if [ "$PRINT_ONLY" = "1" ]; then
  plist_body
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
plist_body >"$PLIST"

launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true

python3 "$ROOT/tools/agent_runner.py" ensure-labels >/dev/null 2>&1 || true

printf 'installed: %s\n' "$PLIST"
printf 'log:       %s\n' "$LOG_DIR/universe-agent-runner.log"
printf 'queue:     label issues with "agent:ready" (or tools/agent.sh enqueue)\n'

WATCHER_PLIST="$HOME/Library/LaunchAgents/com.takuto277.universe-auto-pr.plist"
if [ ! -f "$WATCHER_PLIST" ]; then
  if [ -x "$ROOT/tools/install-auto-pr.sh" ]; then
    printf 'note:      auto-pr watcher が未登録です。PR のレビューとマージまで無人にするには\n'
    printf '           ./tools/install-auto-pr.sh も実行してください。\n'
  else
    printf 'note:      auto-pr watcher は未導入です。\n'
    printf '           レビューとマージまで無人にするには watcher をセットアップしてください。\n'
  fi
fi
