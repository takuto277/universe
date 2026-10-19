#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -n "${JSC:-}" ]]; then
  :
elif command -v jsc >/dev/null 2>&1; then
  JSC="$(command -v jsc)"
elif [[ -x /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc ]]; then
  JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
elif [[ -x /Applications/Xcode.app/Contents/Developer/usr/bin/jsc ]]; then
  JSC=/Applications/Xcode.app/Contents/Developer/usr/bin/jsc
else
  printf 'jsc が見つかりません。JSC 環境変数でパスを指定してください。\n' >&2
  exit 1
fi

count=0

for dir in "$ROOT"/*/; do
  [[ -f "${dir}index.html" ]] || continue
  tests=("${dir}"test-*.js)
  [[ -e "${tests[0]}" ]] || continue

  for test in "${tests[@]}"; do
    printf '==> %s\n' "${test#"$ROOT"/}"
    (cd "$dir" && "$JSC" "$(basename "$test")")
    count=$((count + 1))
  done
done

if [[ "$count" -eq 0 ]]; then
  printf 'テストが見つかりません。\n' >&2
  exit 1
fi

printf 'tests passed: %d file(s)\n' "$count"
