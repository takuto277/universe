# universe

[![CI](https://github.com/takuto277/universe/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/takuto277/universe/actions/workflows/ci.yml)

自作ゲーム・アプリのハブです。依存ゼロの静的ファイルで作り、GitHub Pages で公開します。

## 構成

```text
universe/
├── apps.json          # 公開するアプリの一覧（正）
├── index.html         # ハブ画面
├── baseball-game/     # アプリ本体・テスト・README
├── janken-game/       # アプリ本体・テスト・README
├── gravity-flip/      # アプリ本体・テスト・README
├── graph-cross/       # アプリ本体・テスト・README
├── docs/              # 開発・学習ドキュメント
└── tools/             # 共通テストハーネスと検査スクリプト
```

## ローカルで動かす

```sh
python3 -m http.server 8000
```

http://localhost:8000/ を開きます。

## テスト

```sh
./tools/verify.sh
```

`verify.sh` は各アプリの `test-*.js` を JavaScriptCore の `jsc` で実行し、`apps.json`、`index.html`、アプリ内のリンクの整合性を検査します。

## 開発フロー

main へ直接 push せず、作業ブランチと PR を使います。PR では GitHub Actions の `tests` と `site` が必須です。レビューとマージは分離した AI エージェントが担当し、五点ゲートを通った PR だけを squash merge します。opencode では `/pr-deliver <PR番号>`、`/pr-review <PR番号>`、`/pr-merge <PR番号>` を使います。詳しくは [docs/pr-workflow.md](docs/pr-workflow.md) を参照してください。

## アプリを追加する

[docs/adding-an-app.md](docs/adding-an-app.md) の手順に従ってください。`apps.json`、`index.html`、アプリの `README.md`、テストを同じ変更で更新します。

## ドキュメント

入口は [docs/README.md](docs/README.md) です。
