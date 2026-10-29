# アプリの追加手順

新しいアプリは、実装だけでなく一覧・テスト・説明を同じ変更で追加します。

## 1. 配置先を決めてディレクトリを作る

[`projects/` の分類ルール](../projects/README.md)に従い、公開・継続保守なら `projects/`、実験なら `projects/_labs/`、教材・検証なら `projects/_samples/` に置きます。

```sh
mkdir -p projects/_labs/my-app
```

`projects/_labs/my-app/index.html` を入口にします。`</body>` の直前に `projects/_shared/game-back.js` を読み込むと、最上部に一覧へ戻る共通ナビゲーションバーが付きます。公開 URL は `https://takuto277.github.io/universe/projects/_labs/my-app/` になるため、配置パスは URL の一部として扱います。

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
- 画面操作を含む場合は `test-smoke.js` から `tools/harness.js` の `Harness.run` を呼ぶ（`projects/_labs/` / `_samples/` からは `../../../tools/harness.js`）
- 乱数を使う処理は、テスト時に固定できるようにする

詳しくは [テスト](testing.md) を参照してください。

## 4. README を書く

`projects/_labs/my-app/README.md` に次を書きます。

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
  "path": "projects/_labs/my-app/",
  "tag": "GAME",
  "title": "My App",
  "description": "詳細な説明",
  "summary": "一覧カードに出す1行の説明",
  "tags": ["ジャンル", "操作"],
  "thumbnail": "projects/_labs/my-app/thumb.jpg",
  "createdAt": "2026-10-29",
  "updatedAt": "2026-10-29T12:00:00+09:00"
}
```

トップページの一覧は `apps.json` から自動生成されるため、`index.html` にカードを手で追加する必要はありません。`summary`、`tags`、`thumbnail`、`createdAt`、`updatedAt`（更新時刻のISO日時）を設定し、[ゲーム一覧](game-list.md) の手順でサムネイルを生成してください。ゲームを更新したら `updatedAt` も更新してください。

## 6. 検査する

```sh
./tools/run-tests.sh
python3 tools/check_site.py
python3 -m http.server 8000
```

`check_site.py` は一覧とカードの不一致、存在しないリンク、README やテストの欠落を検出します。

## 7. コミットする

作業ブランチでコミットし、CI が通ることを確認してから main にマージします。コミットメッセージは `my-app: ...` のようにアプリ名で始めます。既存アプリを移動した場合は、旧URLからのリダイレクトも同じPRで追加します。
