# AGENTS.md

universe は自作ゲーム・アプリを静的ファイルで公開する個人用ハブです。エージェントはこのファイルと各アプリの `README.md` を先に読んでください。

## コマンド

```sh
./tools/verify.sh             # テスト + サイト検査
./tools/run-tests.sh          # 全アプリの test-*.js
python3 tools/check_site.py   # apps.json / index.html / ローカルリンクの検査
python3 -m http.server 8000   # ローカル確認
```

## 構成

- `apps.json` が公開アプリ一覧の正。`index.html` のカードと一致させる
- 各アプリはトップレベルのディレクトリに置き、`index.html`、`README.md`、`test-*.js` を持つ
- ゲームは `window.__GAME__`（`id` / `title` / `start` / `autoPlayStep` / `isDone` / `getState`）を公開する
- 共通のスモークテスト基盤は `tools/harness.js`

## ルール

- 依存ゼロの静的構成を基本とする。ビルドや外部ランタイムを増やす場合は、先に理由を `docs/decisions/` に記録する
- 公開 URL を壊さない。アプリのディレクトリ名やパスを変えるときはリダイレクトを用意する
- アプリを追加・変更したら、`apps.json`、`index.html`、`README.md`、テストを同じ変更で更新する
- main へ直接 push せず、作業ブランチを作って PR を出す。main は branch protection で保護され、`tests` / `site` と CodeRabbit の承認が揃うまでマージできない
- CodeRabbit の指摘は修正するか理由をコメントして resolve する。作者自身の `@coderabbitai approve` は使わない
- PR の本文は `.github/pull_request_template.md` に沿って書く。マージ前に `./tools/verify.sh` を通す
- コミットメッセージは `baseball-game: ...` のようにアプリ名または `repo:` で始め、日本語で理由が分かるように書く
- テストは利用者から見た挙動を検証する。実装の詳細やソース文字列の一致に依存しすぎない
- コメントはコードを読めば分かることを繰り返さず、なぜそうしたかを短く書く
- 判断の理由は `docs/`、アプリ固有の使い方は各アプリの `README.md` に書く
