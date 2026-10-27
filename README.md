# universe

[![CI](https://github.com/takuto277/universe/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/takuto277/universe/actions/workflows/ci.yml)

依存ゼロの静的ゲームを公開するモノレポです。ゲームは `projects/`、それらを無人で実装・レビュー・公開する開発基盤は `tools/` に置きます。

- **本体**: `tools/` の無人開発基盤（Issue → 実装 → PR → レビュー → マージ）
- **成果物**: `projects/` のゲーム（実験・サンプル・公開物）。分類は [projects/README.md](projects/README.md)
- **移行中**: `graph-cross/` は進行中ブランチ、`exponential-balls/` はマージ直後のため、落ち着いてから `projects/_labs/` へ移動します

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

## 開発環境を作る

新規の Mac では、前提ツールを入れてから setup を実行します。前提が欠けていると `--with-agents` / `--verify` は登録・実行の前に中止します。

```sh
# 1. git / python3 / jsc を入れる
xcode-select --install

# 2. opencode を公式手順でインストールする
#    https://opencode.ai/docs/

# 3. gh を導入して認証する（--install は Homebrew がある場合のみ）
./tools/setup.sh --install   # 未認証だと exit 1。続けて認証する
gh auth login

# 4. 前提の確認、LaunchAgent の登録、verify
./tools/setup.sh --with-agents --verify
```

`--install` は不足している `gh` だけを導入し、opencode は自動では入れません。Homebrew が無い場合は https://cli.github.com/ から `gh` を入れてください。詳しくは [docs/setup.md](docs/setup.md) を参照してください。

## 構成

```text
universe/
├── apps.json                  # 公開するアプリの一覧（正）
├── index.html                 # ハブ画面
├── projects/
│   ├── _labs/                 # 実験・検証・継続開発中のゲーム
│   │   ├── baseball-game/
│   │   ├── gravity-flip/
│   │   ├── observer-game/
│   │   └── unknown-word-deal/
│   └── _samples/              # 教材・最小実装
│       └── janken-game/
├── graph-cross/               # 移行待ち（進行中ブランチを優先）
├── exponential-balls/         # 移行待ち（PR #148 マージ済み）
├── .opencode/                 # エージェント・コマンド・スキル
├── docs/                      # 開発・学習ドキュメント
└── tools/                     # 無人開発基盤・共通テストハーネス
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
