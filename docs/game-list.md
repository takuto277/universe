# ゲーム一覧

トップページの `index.html` は `apps.json` を読み込み、ブラウザ上でゲーム一覧を生成します。ゲームを追加するときは `apps.json` に登録し、サムネイルを生成すれば一覧へ自動的に載ります。

## 表示

- サムネイル: `apps.json` の `thumbnail`
- タイトル・説明: `apps.json`
- タグ: `apps.json` の `tags`。一覧上部のボタンで絞り込めます
- カード全体がゲームへのリンク
- 各ゲームの右端中央に「一覧へ」タブ（`projects/_shared/game-back.js`）

## サムネイル

タイトル画面ではなく、ゲームプレイ中の画面を使います。

```sh
python3 tools/playtest/serve.py --directory . --port 8000 &
python3 tools/thumbnails/generate.py --base-url http://127.0.0.1:8000
```

生成サイズは 1200×800（3:2）です。`apps.json` の `thumbnail` はアプリディレクトリ内の `thumb.jpg` を指します。

## ゲーム追加時

`docs/adding-an-app.md` の手順に従い、`apps.json` に `tags` と `thumbnail` を追加し、サムネイルを生成してください。
