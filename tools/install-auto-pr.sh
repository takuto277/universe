#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.takuto277.universe-auto-pr"
DOMAIN="gui/$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
REPO="${UNIVERSE_AUTO_PR_REPO:-takuto277/universe}"
MODEL="${UNIVERSE_AUTO_PR_MODEL:-opencode/deepseek-v4.1-flash-free}"
GH="${GH_BIN:-$(command -v gh || true)}"

usage() {
  cat <<'EOF'
Usage: tools/install-auto-pr.sh [--uninstall|--status]

Installs a macOS LaunchAgent that runs tools/auto-pr.sh every 60 seconds.
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
  '')
    ;;
  *)
    printf 'unknown option: %s\n' "$1" >&2
    usage >&2
    exit 2
    ;;
esac

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

PLIST_LABEL="$(xml_escape "$LABEL")"
PLIST_ROOT="$(xml_escape "$ROOT")"
PLIST_HOME="$(xml_escape "$HOME")"
PLIST_LOG_DIR="$(xml_escape "$LOG_DIR")"
PLIST_MODEL="$(xml_escape "$MODEL")"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PLIST_ROOT/tools/auto-pr.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PLIST_ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$PLIST_HOME/.opencode/bin:$PLIST_HOME/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>LANG</key>
    <string>ja_JP.UTF-8</string>
    <key>UNIVERSE_AUTO_PR_MODEL</key>
    <string>$PLIST_MODEL</string>
  </dict>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>$PLIST_LOG_DIR/universe-auto-pr.launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$PLIST_LOG_DIR/universe-auto-pr.launchd.log</string>
</dict>
</plist>
EOF

launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true

if [ -n "$GH" ] && [ -x "$GH" ]; then
  "$GH" label create ai-pause \
    --repo "$REPO" \
    --color "B60205" \
    --description "ローカルAIの自動レビュー・マージを止める" \
    --force >/dev/null 2>&1 || true
  "$GH" label create do-not-merge \
    --repo "$REPO" \
    --color "5319E7" \
    --description "マージしない" \
    --force >/dev/null 2>&1 || true
fi

printf 'installed: %s\n' "$PLIST"
printf 'log:       %s\n' "$LOG_DIR/universe-auto-pr.log"
printf 'pause:     touch %s/.local/state/universe-auto-pr/pause\n' "$HOME"
