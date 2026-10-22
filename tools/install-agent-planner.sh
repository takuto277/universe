#!/usr/bin/env bash
# install-agent-planner.sh : 週次の改善提案（planner）を LaunchAgent に登録する
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.takuto277.universe-agent-planner"
DOMAIN="gui/$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
REPO="${UNIVERSE_AGENT_REPO:-takuto277/universe}"
AUTO_ROOT="${UNIVERSE_AUTOMATION_ROOT:-$HOME/.local/share/universe-automation}"
BASE="${UNIVERSE_AGENT_BASE:-main}"
MODEL="${UNIVERSE_AGENT_MODEL:-opencode/deepseek-v4.1-flash-free}"
SANDBOX="${UNIVERSE_AGENT_SANDBOX:-none}"
AUTO_READY="${UNIVERSE_AGENT_AUTO_READY_PROPOSALS:-0}"

usage() {
  cat <<'USAGE'
Usage: tools/install-agent-planner.sh [--print|--uninstall|--status]

Installs a macOS LaunchAgent that runs `tools/agent.sh propose` every Monday
at 09:00. Proposals are created as issues labeled "agent:proposed" unless
UNIVERSE_AGENT_AUTO_READY_PROPOSALS=1 is set at install time.
USAGE
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
    PRINT_ONLY=0
    ;;
  *)
    printf 'unknown option: %s\n' "$1" >&2
    usage >&2
    exit 2
    ;;
esac

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

PLIST_LABEL="$(xml_escape "$LABEL")"
PLIST_AUTO="$(xml_escape "$AUTO_ROOT")"
PLIST_HOME="$(xml_escape "$HOME")"
PLIST_LOG_DIR="$(xml_escape "$LOG_DIR")"
PLIST_MODEL="$(xml_escape "$MODEL")"
PLIST_REPO="$(xml_escape "$REPO")"
PLIST_BASE="$(xml_escape "$BASE")"
PLIST_SANDBOX="$(xml_escape "$SANDBOX")"
PLIST_AUTO_READY="$(xml_escape "$AUTO_READY")"

plist_body() {
cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PLIST_AUTO/tools/automation-run.sh</string>
    <string>agent.sh</string>
    <string>propose</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PLIST_AUTO</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$PLIST_HOME/.opencode/bin:$PLIST_HOME/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>LANG</key>
    <string>ja_JP.UTF-8</string>
    <key>UNIVERSE_AGENT_MODEL</key>
    <string>$PLIST_MODEL</string>
    <key>UNIVERSE_AGENT_REPO</key>
    <string>$PLIST_REPO</string>
    <key>UNIVERSE_AGENT_BASE</key>
    <string>$PLIST_BASE</string>
    <key>UNIVERSE_AGENT_SANDBOX</key>
    <string>$PLIST_SANDBOX</string>
    <key>UNIVERSE_AGENT_AUTO_READY_PROPOSALS</key>
    <string>$PLIST_AUTO_READY</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>1</integer>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>$PLIST_LOG_DIR/universe-agent-planner.launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$PLIST_LOG_DIR/universe-agent-planner.error.log</string>
</dict>
</plist>
PLIST
}

if [ "$PRINT_ONLY" = "1" ]; then
  plist_body
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
if ! UNIVERSE_AGENT_BASE="$BASE" bash "$ROOT/tools/automation-root.sh" ensure >/dev/null; then
  printf 'failed to prepare automation root: %s\n' "$AUTO_ROOT" >&2
  exit 1
fi
plist_body >"$PLIST"
launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true

printf 'installed: %s\n' "$PLIST"
printf 'run from:  %s\n' "$AUTO_ROOT"
printf 'log:       %s\n' "$LOG_DIR/universe-agent-planner.launchd.log"
printf 'schedule:  every Monday 09:00\n'
