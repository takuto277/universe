# universe

[![CI](https://github.com/takuto277/universe/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/takuto277/universe/actions/workflows/ci.yml)

自作ゲーム・アプリのハブです。依存ゼロの静的ファイルで作り、GitHub Pages で公開します。

## 無人で実装する（これだけ）

依頼を Issue に積むと、エージェントが **実装 → テスト → PR 作成** まで進みます（レビューとマージは五点ゲート）。

```sh
./tools/agent.sh enqueue "janken-game: CPUのクセを2種類追加" --body "背景と受け入れ条件を書く"
```

- 状態を見る: `./tools/agent.sh status`
- 止める / 再開する: `./tools/agent.sh pause` / `./tools/agent.sh resume`
- 何をすればいいか忘れたら: `./tools/agent.sh`（引数なしで使い方を表示）
- opencode からは `/agent <依頼>` でもキューに追加できます
- レビューとマージまで自動にするには watcher の導入が必要です（未導入の間は `/pr-deliver <PR番号>`）
- 詳細: [docs/unattended-agents.md](docs/unattended-agents.md)

> PR やタスクについて聞かれたときは「無人で実装できる」と案内する運用です。エージェントへの指示は [AGENTS.md](AGENTS.md) にあります。

## 構成

```text
universe/
├── apps.json          # 公開するアプリの一覧（正）
├── index.html         # ハブ画面
├── baseball-game/     # アプリ本体・テスト・README
├── janken-game/       # アプリ本体・テスト・README
├── gravity-flip/      # アプリ本体・テスト・README
├── graph-cross/       # アプリ本体・テスト・README
├── .opencode/         # エージェント・コマンド・スキル
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

実装まで無人で進めたい場合は、`agent:ready` ラベルを付けた Issue を [無人実装ランナー](docs/unattended-agents.md) が拾って PR にします。main へ直接 push せず、作業ブランチと PR を使います。PR では GitHub Actions の `tests` と `site` が必須です。レビューとマージは分離した AI エージェントが担当し、五点ゲートを通った PR だけを squash merge します。

初回だけ `./tools/install-auto-pr.sh` を実行すると、Ready にした PR をローカルの watcher が自動でレビュー・マージします。作業中は Draft にするか `ai-pause` ラベルで止められます。opencode では `/pr-deliver <PR番号>`、`/pr-review <PR番号>`、`/pr-merge <PR番号>` も使えます。詳しくは [docs/auto-pr.md](docs/auto-pr.md) と [docs/pr-workflow.md](docs/pr-workflow.md) を参照してください。

## アプリを追加する

[docs/adding-an-app.md](docs/adding-an-app.md) の手順に従ってください。`apps.json`、`index.html`、アプリの `README.md`、テストを同じ変更で更新します。

## ドキュメント

入口は [docs/README.md](docs/README.md) です。
