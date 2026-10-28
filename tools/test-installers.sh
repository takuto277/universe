#!/usr/bin/env bash
# test-installers.sh : installer が専用チェックアウトを作ってからplistを書くことを検証する
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/universe-installers.XXXXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/home"
cat >"$TMP/bin/launchctl" <<SH
#!/bin/sh
printf '%s\\n' "\$*" >>"$TMP/launchctl.log"
exit 0
SH
cat >"$TMP/bin/gh" <<'SH'
#!/bin/sh
exit 0
SH
chmod +x "$TMP/bin/launchctl" "$TMP/bin/gh"

git init -q -b main "$TMP/remote.git" --bare
git init -q -b main "$TMP/seed"
git -C "$TMP/seed" config user.name test
git -C "$TMP/seed" config user.email test@example.com
git -C "$TMP/seed" remote add origin "$TMP/remote.git"
printf 'seed\n' >"$TMP/seed/value.txt"
git -C "$TMP/seed" add value.txt
git -C "$TMP/seed" commit -qm seed
git -C "$TMP/seed" push -q origin main
mkdir -p "$TMP/seed/tools"
cp "$ROOT/tools/automation-root.sh" "$ROOT/tools/install-auto-pr.sh" \
  "$ROOT/tools/install-agent-runner.sh" "$ROOT/tools/install-agent-planner.sh" \
  "$ROOT/tools/install-experiment-runner.sh" "$TMP/seed/tools/"

AUTO="$TMP/auto"
HOME="$TMP/home" PATH="$TMP/bin:/usr/bin:/bin" UNIVERSE_AUTOMATION_ROOT="$AUTO" \
  UNIVERSE_AGENT_BASE=main bash "$TMP/seed/tools/install-auto-pr.sh" >/dev/null
[ -e "$AUTO/.git" ]
plist="$TMP/home/Library/LaunchAgents/com.takuto277.universe-auto-pr.plist"
[ -f "$plist" ]
grep -q "$AUTO/tools/automation-run.sh" "$plist"
grep -q bootstrap "$TMP/launchctl.log"

for script in install-agent-runner.sh install-agent-planner.sh install-experiment-runner.sh; do
  HOME="$TMP/home" PATH="$TMP/bin:/usr/bin:/bin" UNIVERSE_AUTOMATION_ROOT="$AUTO" \
    UNIVERSE_AGENT_BASE=main bash "$TMP/seed/tools/$script" >/dev/null
done
for label in com.takuto277.universe-agent-runner com.takuto277.universe-agent-planner com.takuto277.universe-experiment-runner; do
  plist="$TMP/home/Library/LaunchAgents/$label.plist"
  [ -f "$plist" ]
  grep -q "$AUTO/tools/automation-run.sh" "$plist"
done
exp_plist="$TMP/home/Library/LaunchAgents/com.takuto277.universe-experiment-runner.plist"
grep -q "experiment:ready" "$exp_plist"
grep -q "experiment/" "$exp_plist"
grep -q "universe-experiment-runner" "$exp_plist"

AUTO2="$TMP/auto2"
if HOME="$TMP/home2" PATH="$TMP/bin:/usr/bin:/bin" UNIVERSE_AUTOMATION_ROOT="$AUTO2" \
  UNIVERSE_AUTO_PR_BASE=missing bash "$TMP/seed/tools/install-auto-pr.sh" >/dev/null 2>&1; then
  printf 'installer should fail when the base fetch fails\\n' >&2
  exit 1
fi
[ ! -e "$TMP/home2/Library/LaunchAgents/com.takuto277.universe-auto-pr.plist" ]

printf 'installer tests OK\n'
