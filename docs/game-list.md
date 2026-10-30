# ゲーム一覧

トップページの `index.html` は `apps.json` を読み込み、ブラウザ上でゲーム一覧を生成します。ゲームを追加するときは `apps.json` に登録し、サムネイルを生成すれば一覧へ自動的に載ります。ゲームを更新したときは `updatedAt` を現在時刻（ISO日時）に更新すると更新順の先頭へ移動します。日付が欠けている場合は `python3 tools/sync_app_dates.py` で補完できます。

## 表示

- サムネイル: `apps.json` の `thumbnail`
- タイトル・説明: `apps.json`（カードは `summary`。PCは1行、スマホは折り返し）
- ジャンル: `apps.json` の `tags`。一覧上部のピッカーで絞り込めます
- カード全体がゲームへのリンク
- 並び順: 「おすすめ順」と「更新順」を切り替え可能。初期表示はおすすめ順
- おすすめ順: `index.html` の `RECOMMENDED` に並べたIDが先頭。その後に残りを `updatedAt` が新しい順で並べる
- 更新順: `updatedAt` が新しい順。同じ日時なら `createdAt` が新しい順
- カード右下: 作成日と更新日
- 各ゲーム最上部の共通ナビゲーションバーから「ゲーム一覧へ」（`projects/_shared/game-back.js`）

## サムネイル

タイトル画面ではなく、ゲームプレイ中の画面を使います。

```sh
python3 tools/playtest/serve.py --directory . --port 8000 &
python3 tools/thumbnails/generate.py --base-url http://127.0.0.1:8000
```

生成サイズは 1200×800（3:2）です。`apps.json` の `thumbnail` はアプリディレクトリ内の `thumb.jpg` を指します。カードはPC・スマホとも2列で、`summary` を表示します（PCは1行、スマホは折り返し）。

## ゲーム追加時

`docs/adding-an-app.md` の手順に従い、`apps.json` に `tags` と `thumbnail` を追加し、サムネイルを生成してください。
