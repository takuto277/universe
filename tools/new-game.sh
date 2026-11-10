#!/usr/bin/env bash
# tools/new-game.sh : 新しいゲームの雛形を生成する
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ID=""
TITLE=""
GROUP="labs"
TAGS="ミニゲーム"
DRY_RUN=0

usage() {
  cat <<'USAGE'
使い方: ./tools/new-game.sh <id> [オプション]

  <id>            小文字英数字とハイフン (例: my-game)
  --title TEXT    表示タイトル (既定: id から生成)
  --group NAME    配置先: labs (既定) または samples
  --tags "a,b"    一覧のタグ (既定: ミニゲーム)
  --root DIR      生成先リポジトリ (テスト用)
  --dry-run       ファイルを作らず生成内容だけ表示
  -h, --help      この使い方
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="${2:-}"; shift 2 ;;
    --group) GROUP="${2:-}"; shift 2 ;;
    --tags) TAGS="${2:-}"; shift 2 ;;
    --root) ROOT="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) printf '不明なオプション: %s\n' "$1" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -n "$ID" ]]; then
        printf 'id は1つだけ指定してください\n' >&2
        exit 2
      fi
      ID="$1"
      shift
      ;;
  esac
done

if [[ -z "$ID" ]]; then
  usage >&2
  exit 2
fi
if [[ ! "$ID" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  printf 'id は小文字英字で始まり、小文字英数字とハイフンだけにしてください: %s\n' "$ID" >&2
  exit 2
fi

case "$GROUP" in
  labs) BASE="projects/_labs" ;;
  samples) BASE="projects/_samples" ;;
  *)
    printf -- '--group は labs か samples を指定してください: %s\n' "$GROUP" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$ROOT" && pwd)"
APP_REL="$BASE/$ID/"
APP_DIR="$ROOT/$APP_REL"
APPS_JSON="$ROOT/apps.json"

if [[ ! -f "$APPS_JSON" ]]; then
  printf 'apps.json がありません: %s\n' "$APPS_JSON" >&2
  exit 1
fi
if [[ -e "$APP_DIR" ]]; then
  printf '既に存在します: %s\n' "$APP_REL" >&2
  exit 1
fi

python3 - "$APPS_JSON" "$ID" "$APP_REL" <<'PY'
import json
import sys

path, app_id, app_path = sys.argv[1:4]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
for app in data.get("apps", []):
    if app.get("id") == app_id or app.get("path") == app_path:
        raise SystemExit("apps.json に既に登録されています: %s" % (app.get("id") or app.get("path")))
PY

if [[ -z "$TITLE" ]]; then
  TITLE="$(python3 - "$ID" <<'PY'
import sys
print(" ".join(part[:1].upper() + part[1:] for part in sys.argv[1].split("-")))
PY
)"
fi
ENGINE_GLOBAL="$(python3 - "$ID" <<'PY'
import sys
print("".join(part[:1].upper() + part[1:] for part in sys.argv[1].split("-")) + "Engine")
PY
)"
VERSION="$(date +%Y%m%d)-${ID//-/}"
TODAY="$(date +%Y-%m-%d)"
NOW="$(python3 - <<'PY'
from datetime import datetime
print(datetime.now().astimezone().isoformat(timespec="seconds"))
PY
)"
TAGS_JSON="$(python3 - "$TAGS" <<'PY'
import json
import sys
items = [item.strip() for item in sys.argv[1].replace("、", ",").split(",") if item.strip()]
print(json.dumps(items, ensure_ascii=False))
PY
)"

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf 'would create %s\n' "$APP_REL"
  printf '  title: %s\n' "$TITLE"
  printf '  engine global: %s\n' "$ENGINE_GLOBAL"
  printf '  files: index.html README.md style.css engine.js game.js test-engine.js test-smoke.js\n'
  printf '  apps.json: append %s\n' "$ID"
  printf '  thumbnail: %s\n' "${APP_REL}thumb.jpg"
  exit 0
fi

mkdir -p "$APP_DIR"

cat > "$APP_DIR/index.html" <<'HTML'
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>__TITLE_HTML__</title>
  <link rel="stylesheet" href="style.css?v=__VERSION__">
</head>
<body>
  <main id="app">
    <header class="hud">
      <p><span id="count">0</span> / <span id="goal">10</span> TAPS</p>
    </header>

    <section id="screen-start" class="screen visible">
      <h1>__TITLE_HTML__</h1>
      <p>10回タップするとゴールです。</p>
      <button id="btn-start" class="primary" type="button">START</button>
    </section>

    <section id="screen-play" class="screen visible">
      <button id="btn-tap" class="tap" type="button">TAP</button>
    </section>

    <section id="screen-end" class="screen">
      <h2>RESULT <span id="end-rank">S</span></h2>
      <p><span id="end-score">0</span> taps</p>
      <button id="btn-again" class="primary" type="button">AGAIN</button>
    </section>
  </main>
  <script src="../../_shared/game-back.js"></script>
  <script src="engine.js?v=__VERSION__"></script>
  <script src="game.js?v=__VERSION__"></script>
</body>
</html>
HTML

cat > "$APP_DIR/style.css" <<'CSS'
:root {
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0b1020;
  color: #e8ecff;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
}

.hud {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
}

.screen {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.screen.visible {
  display: flex;
}

h1,
h2 {
  margin: 0;
}

button {
  font: inherit;
  cursor: pointer;
  border: 0;
  border-radius: 999px;
  padding: 14px 28px;
  color: inherit;
  background: #26305a;
}

button.primary {
  background: #5b8cff;
  color: #06102a;
  font-weight: 700;
}

button.tap {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: #ff68d4;
  color: #2a0620;
  font-size: 24px;
  font-weight: 700;
}
CSS

cat > "$APP_DIR/engine.js" <<'JS'
/* engine.js : __TITLE__ のコアロジック */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.__ENGINE_GLOBAL__ = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var GOAL = 10;

  function createGame(opts) {
    opts = opts || {};
    return {
      phase: 'idle',
      taps: 0,
      goal: GOAL,
      over: false,
      result: null,
      rng: opts.rng || Math.random
    };
  }

  function start(state) {
    if (!state) return false;
    state.phase = 'run';
    state.taps = 0;
    state.over = false;
    state.result = null;
    return true;
  }

  function tap(state) {
    if (!state || state.phase !== 'run') return false;
    state.taps++;
    if (state.taps >= state.goal) finish(state);
    return true;
  }

  function finish(state) {
    state.phase = 'over';
    state.over = true;
    state.result = {
      taps: state.taps,
      goal: state.goal,
      rank: state.taps >= state.goal ? 'S' : 'C'
    };
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') { start(state); return; }
    if (state.phase === 'run') tap(state);
  }

  function snapshot(state) {
    if (!state) return null;
    return {
      phase: state.phase,
      taps: state.taps,
      goal: state.goal,
      over: state.over,
      result: state.result
    };
  }

  return {
    GOAL: GOAL,
    createGame: createGame,
    start: start,
    tap: tap,
    autoStep: autoStep,
    snapshot: snapshot
  };
});
JS

cat > "$APP_DIR/game.js" <<'JS'
/* game.js : __TITLE__（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.__ENGINE_GLOBAL__) ? window.__ENGINE_GLOBAL__ : null;
  if (!E) return;

  var state = null;
  var els = {};

  function $(id) { return document.getElementById(id); }
  function show(el, visible) { if (el) el.classList.toggle('visible', !!visible); }

  function updateHud() {
    if (!state) return;
    if (els.count) els.count.textContent = String(state.taps);
    if (els.goal) els.goal.textContent = String(state.goal);
  }

  function render() {
    if (!state) return;
    updateHud();
    if (state.phase === 'over' && state.result) {
      show(els.start, false);
      show(els.play, false);
      show(els.end, true);
      if (els.endScore) els.endScore.textContent = String(state.result.taps);
      if (els.endRank) els.endRank.textContent = state.result.rank;
    }
  }

  function begin() {
    if (!state) return;
    E.start(state);
    show(els.start, false);
    show(els.play, true);
    show(els.end, false);
    updateHud();
  }

  function tap() {
    if (!state || state.phase !== 'run') return;
    E.tap(state);
    render();
  }

  function init() {
    els = {
      start: $('screen-start'),
      play: $('screen-play'),
      end: $('screen-end'),
      count: $('count'),
      goal: $('goal'),
      endScore: $('end-score'),
      endRank: $('end-rank'),
      btnStart: $('btn-start'),
      btnAgain: $('btn-again'),
      btnTap: $('btn-tap')
    };
    state = E.createGame();
    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnAgain) els.btnAgain.addEventListener('click', begin);
    if (els.btnTap) els.btnTap.addEventListener('click', tap);
    window.addEventListener('keydown', function (e) {
      if (e && (e.key === ' ' || e.key === 'Enter')) tap();
    });
    show(els.start, true);
    show(els.play, false);
    show(els.end, false);
    updateHud();

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: '__ID__',
        title: __TITLE_JS__,
        start: function () { begin(); },
        autoPlayStep: function () {
          if (!state) return;
          E.autoStep(state);
          render();
        },
        isDone: function () { return !!(state && state.over); },
        getState: function () { return state ? E.snapshot(state) : null; }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
JS

cat > "$APP_DIR/test-engine.js" <<'JS'
/* test-engine.js : __TITLE__ のロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = __ENGINE_GLOBAL__; }

function assert(cond, message) { if (!cond) throw new Error(message); }

var g = E.createGame({ rng: function () { return 0.5; } });
assert(g.phase === 'idle', '初期状態はidle');
assert(g.taps === 0 && g.over === false, '開始前は0タップ');
assert(E.start(g) === true && g.phase === 'run', '開始できる');
for (var i = 0; i < E.GOAL - 1; i++) E.tap(g);
assert(g.over === false, 'ゴール前は終了しない');
E.tap(g);
assert(g.over === true && g.phase === 'over', 'ゴールで終了する');
assert(g.result && g.result.taps === E.GOAL, '結果にタップ数が入る');
assert(E.tap(g) === false, '終了後はタップできない');

var auto = E.createGame();
E.start(auto);
for (i = 0; i < E.GOAL; i++) E.autoStep(auto);
assert(auto.over === true, 'autoStepで完走できる');
print('engine tests OK');
JS

cat > "$APP_DIR/test-smoke.js" <<'JS'
/* test-smoke.js : __TITLE__ を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', '__APP_REL__engine.js']);
tryLoad(['game.js', '__APP_REL__game.js']);

Harness.run({
  name: '__ID__',
  maxSteps: 1000,
  afterDone: 40,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.over === true, '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result && state.result.taps === state.goal, '結果のタップ数が不正');
    var els = h.elements;
    h.assert(!els['screen-start'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['screen-end'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['end-score'].textContent === String(state.result.taps), '結果表示が状態と不一致');
  },
  summary: function (state) {
    print('  taps=' + state.result.taps + ' / rank=' + state.result.rank);
  }
});
JS

cat > "$APP_DIR/README.md" <<'MD'
# __TITLE__

__TITLE__ の雛形です。`engine.js` のロジックと `game.js` の描画を書き換えてゲームにします。

## 遊び方

- START で開始
- 10回タップすると結果画面

## 構成

| ファイル | 役割 |
| --- | --- |
| `engine.js` | 状態、タップ、終了判定 |
| `game.js` | DOM描画、入力、画面遷移 |
| `index.html` | 画面の骨格 |
| `style.css` | 見た目 |
| `test-engine.js` | ロジックのテスト |
| `test-smoke.js` | 自動プレイのスモークテスト |

## テスト

```sh
./tools/run-tests.sh
```

個別:

```sh
cd __APP_REL__
jsc test-engine.js
jsc test-smoke.js
```

## 設計メモ

- `window.__GAME__` の6キー（`id` / `title` / `start` / `autoPlayStep` / `isDone` / `getState`）を公開する
- ロジックは `engine.js` に閉じ、`game.js` は `getState()` を描画する
- 変更したら `index.html` の `?v=` を更新する

## TODO

- ゲーム内容を実装する
- `apps.json` の `description` / `summary` / `tags` を実態に合わせる
- サムネイルを再生成する:

  ```sh
  python3 tools/playtest/serve.py --directory . --port 8000 &
  python3 tools/thumbnails/generate.py --app __ID__
  ```
MD

python3 - "$APP_DIR" "$ID" "$TITLE" "$ENGINE_GLOBAL" "$VERSION" "$APP_REL" <<'PY'
import html
import json
import pathlib
import sys

app_dir = pathlib.Path(sys.argv[1])
app_id, title, engine, version, app_rel = sys.argv[2:7]
repl = {
    "__ID__": app_id,
    "__TITLE__": title,
    "__TITLE_HTML__": html.escape(title),
    "__TITLE_JS__": json.dumps(title, ensure_ascii=False),
    "__ENGINE_GLOBAL__": engine,
    "__VERSION__": version,
    "__APP_REL__": app_rel,
}
for path in app_dir.iterdir():
    if path.suffix not in (".html", ".js", ".css", ".md"):
        continue
    text = path.read_text(encoding="utf-8")
    for key, value in repl.items():
        text = text.replace(key, value)
    path.write_text(text, encoding="utf-8")
PY

THUMB_PNG="$APP_DIR/thumb.tmp.png"
python3 - "$THUMB_PNG" "$ID" <<'PY'
import struct
import sys
import zlib

path, seed = sys.argv[1], sys.argv[2]
width, height = 1200, 800
h = 0
for ch in seed:
    h = (h * 131 + ord(ch)) & 0xFFFFFF
r0, g0, b0 = (h >> 16) & 255, (h >> 8) & 255, h & 255
rows = []
for y in range(height):
    t = y / (height - 1)
    r = int(r0 * (0.22 + 0.55 * t))
    g = int(g0 * (0.22 + 0.55 * t))
    b = int(b0 * (0.22 + 0.55 * t))
    rows.append(b"\x00" + bytes((r, g, b)) * width)
raw = b"".join(rows)


def chunk(kind, data):
    payload = kind + data
    return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)


png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(raw, 9))
       + chunk(b"IEND", b""))
with open(path, "wb") as f:
    f.write(png)
PY

if command -v sips >/dev/null 2>&1; then
  sips -s format jpeg -s formatOptions 82 "$THUMB_PNG" --out "$APP_DIR/thumb.jpg" >/dev/null 2>&1
  rm -f "$THUMB_PNG"
  THUMB_REL="${APP_REL}thumb.jpg"
else
  mv "$THUMB_PNG" "$APP_DIR/thumb.png"
  THUMB_REL="${APP_REL}thumb.png"
  printf 'warning: sips が無いため thumb.png を使います。サムネイル生成後に apps.json の thumbnail を thumb.jpg へ変えてください。\n' >&2
fi

python3 - "$APPS_JSON" "$ID" "$APP_REL" "$TITLE" "$TAGS_JSON" "$THUMB_REL" "$TODAY" "$NOW" <<'PY'
import json
import sys

apps_path, app_id, app_path, title, tags_json, thumb, created, updated = sys.argv[1:9]
with open(apps_path, encoding="utf-8") as f:
    text = f.read()
data = json.loads(text)
app = {
    "id": app_id,
    "path": app_path,
    "tag": "GAME",
    "title": title,
    "description": title + "の雛形。engine.js と game.js を書き換えてゲームを作る。",
    "tags": json.loads(tags_json),
    "thumbnail": thumb,
    "summary": title + "の1行説明。",
    "createdAt": created,
    "updatedAt": updated,
}
if not data.get("apps"):
    data["apps"] = [app]
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
else:
    marker = "\n  ]\n}"
    index = text.rfind(marker)
    if index < 0:
        raise SystemExit("apps.json の末尾形式が想定と違います")
    indented = "\n".join("    " + line for line in json.dumps(app, ensure_ascii=False, indent=2).splitlines())
    text = text[:index] + ",\n" + indented + marker
    if text.endswith("\n"):
        text += "\n"
with open(apps_path, "w", encoding="utf-8") as f:
    f.write(text)
PY

printf 'created %s\n' "$APP_REL"
printf '  title: %s\n' "$TITLE"
printf '  next: engine.js / game.js を実装し、README と apps.json の説明を更新する\n'
printf '  test: (cd %s && jsc test-engine.js && jsc test-smoke.js)\n' "$APP_REL"
printf '  thumb: python3 tools/playtest/serve.py --directory . --port 8000 &\n'
printf '         python3 tools/thumbnails/generate.py --app %s\n' "$ID"
