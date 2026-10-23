#!/usr/bin/env bash
# test-setup.sh : setup.sh の --install 経路（gh 導入後に成功扱いになる）を検証する
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/universe-setup.XXXXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/home"

cat >"$TMP/bin/opencode" <<'SH'
#!/bin/sh
echo 1.19.0
SH

cat >"$TMP/bin/brew" <<SH
#!/bin/sh
if [ "\$1" = "install" ] && [ "\$2" = "gh" ]; then
  cat >"$TMP/bin/gh" <<'GH'
#!/bin/sh
case "\$1" in
  --version) echo "gh version 9.9.9" ;;
  auth) exit 0 ;;
esac
GH
  chmod +x "$TMP/bin/gh"
fi
SH
chmod +x "$TMP/bin/opencode" "$TMP/bin/brew"

set +e
output="$(PATH="$TMP/bin:/usr/bin:/bin" HOME="$TMP/home" /bin/bash "$ROOT/tools/setup.sh" --install 2>&1)"
code=$?
set -e
if [ "$code" != "0" ]; then
  printf 'setup --install が失敗しました (exit=%s)\n%s\n' "$code" "$output" >&2
  exit 1
fi
case "$output" in
  *"gh 認証済み"*) ;;
  *) printf 'gh の導入/認証が確認できません\n%s\n' "$output" >&2; exit 1 ;;
esac
printf 'setup tests OK\n'
