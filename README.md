# universe

[![CI](https://github.com/takuto277/universe/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/takuto277/universe/actions/workflows/ci.yml)

自作ゲーム・アプリのハブです。依存ゼロの静的ファイルで作り、GitHub Pages で公開します。

## 構成

```text
universe/
├── apps.json          # 公開するアプリの一覧（正）
├── index.html         # ハブ画面
├── baseball-game/     # アプリ本体・テスト・README
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
./tools/run-tests.sh
python3 tools/check_site.py
```

`run-tests.sh` は各アプリの `test-*.js` を JavaScriptCore の `jsc` で実行します。`check_site.py` は `apps.json`、`index.html`、アプリ内のリンクの整合性を検査します。

## アプリを追加する

[docs/adding-an-app.md](docs/adding-an-app.md) の手順に従ってください。`apps.json`、`index.html`、アプリの `README.md`、テストを同じ変更で更新します。

## ドキュメント

入口は [docs/README.md](docs/README.md) です。
