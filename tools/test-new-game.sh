#!/usr/bin/env bash
# tools/test-new-game.sh : new-game.sh が雛形を生成し、そのテストが通ることを確認する
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

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/projects/_labs" "$TMP/projects/_samples" "$TMP/tools"
printf '{\n  "apps": []\n}\n' > "$TMP/apps.json"
cp "$ROOT/tools/harness.js" "$TMP/tools/harness.js"

"$ROOT/tools/new-game.sh" demo-game --root "$TMP" --title "Demo Game" --tags "ミニゲーム,1ボタン"

APP="$TMP/projects/_labs/demo-game"
for file in index.html README.md style.css engine.js game.js test-engine.js test-smoke.js; do
  if [[ ! -f "$APP/$file" ]]; then
    printf 'missing: %s\n' "$file" >&2
    exit 1
  fi
done

python3 - "$TMP" <<'PY'
import json
import os
import sys

root = sys.argv[1]
with open(os.path.join(root, "apps.json"), encoding="utf-8") as f:
    raw = f.read()
assert raw.endswith("\n"), "apps.json の末尾改行が失われています"
apps = json.loads(raw)["apps"]
assert len(apps) == 1, apps
app = apps[0]
assert app["id"] == "demo-game", app
assert app["path"] == "projects/_labs/demo-game/", app
assert app["title"] == "Demo Game", app
assert app["tags"] == ["ミニゲーム", "1ボタン"], app
assert app["createdAt"] and app["updatedAt"], app
assert app["thumbnail"].startswith("projects/_labs/demo-game/thumb."), app
assert os.path.isfile(os.path.join(root, app["thumbnail"])), app["thumbnail"]
PY

(cd "$APP" && "$JSC" test-engine.js)
(cd "$APP" && "$JSC" test-smoke.js)

"$ROOT/tools/new-game.sh" second-game --root "$TMP" --group samples --title "Second Game"

python3 - "$TMP" <<'PY'
import json
import os
import sys

root = sys.argv[1]
with open(os.path.join(root, "apps.json"), encoding="utf-8") as f:
    raw = f.read()
assert raw.endswith("\n"), "apps.json の末尾改行が失われています"
apps = json.loads(raw)["apps"]
assert [app["id"] for app in apps] == ["demo-game", "second-game"], apps
assert apps[1]["path"] == "projects/_samples/second-game/", apps[1]
assert apps[1]["title"] == "Second Game", apps[1]
assert os.path.isfile(os.path.join(root, apps[1]["thumbnail"])), apps[1]["thumbnail"]
PY

if "$ROOT/tools/new-game.sh" demo-game --root "$TMP" >/dev/null 2>&1; then
  printf '重複した id が失敗しませんでした\n' >&2
  exit 1
fi

if "$ROOT/tools/new-game.sh" Bad_ID --root "$TMP" >/dev/null 2>&1; then
  printf '不正な id が失敗しませんでした\n' >&2
  exit 1
fi

printf 'new-game tests OK\n'
