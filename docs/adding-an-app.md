# アプリの追加手順

新しいアプリは、実装だけでなく一覧・テスト・説明を同じ変更で追加します。

## 1. ディレクトリを作る

```sh
mkdir my-app
```

`my-app/index.html` を入口にします。公開 URL は `https://takuto277.github.io/universe/my-app/` になるため、ディレクトリ名は URL の一部として扱います。

## 2. 実装する

静的ファイルだけで動く構成を基本とします。ゲームの場合は `window.__GAME__` を公開すると、共通ハーネスでスモークテストできます。

```js
window.__GAME__ = {
  id: 'my-app',
  title: 'My App',
  start: function () {},
  autoPlayStep: function () {},
  isDone: function () { return true; },
  getState: function () { return {}; }
};
```

## 3. テストを書く

- ロジックがある場合は `test-engine.js` に純粋な関数のテストを書く
- 画面操作を含む場合は `test-smoke.js` から `tools/harness.js` の `Harness.run` を呼ぶ
- 乱数を使う処理は、テスト時に固定できるようにする

詳しくは [テスト](testing.md) を参照してください。

## 4. README を書く

`my-app/README.md` に次を書きます。

- 何をするアプリか
- 遊び方・使い方
- ファイル構成と設計の要点
- テスト方法
- 学んだこと、既知の制限

## 5. 一覧に登録する

`apps.json` に追加します。

```json
{
  "id": "my-app",
  "path": "my-app/",
  "tag": "APP",
  "title": "My App",
  "description": "一覧に表示する短い説明"
}
```

`index.html` のカードにも同じ `path`、`tag`、`title`、`description` を反映します。

## 6. 検査する

```sh
./tools/run-tests.sh
python3 tools/check_site.py
python3 -m http.server 8000
```

`check_site.py` は一覧とカードの不一致、存在しないリンク、README やテストの欠落を検出します。

## 7. コミットする

作業ブランチでコミットし、CI が通ることを確認してから main にマージします。コミットメッセージは `my-app: ...` のようにアプリ名で始めます。
