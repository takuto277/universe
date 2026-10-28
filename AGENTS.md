# AGENTS.md

universe は、ゲームを題材に無人開発基盤を育てるモノレポです。エージェントはこのファイルと各アプリの `README.md` を先に読んでください。

## コマンド

```sh
./tools/setup.sh              # 開発環境の確認（--with-agents で LaunchAgent 登録）
./tools/verify.sh             # テスト + サイト検査 + PR スクリプトの構文検査
./tools/run-tests.sh          # 全アプリの test-*.js
python3 tools/check_site.py   # apps.json / index.html / ローカルリンクの検査
python3 tools/check_skills.py # スキルの契約検査
./tools/auto-pr.sh --dry-run  # 自動PR処理の対象確認
./tools/install-auto-pr.sh    # 自動PR処理のLaunchAgent登録
python3 tools/pr_merge.py --pr <n>  # 五点ゲート + squash merge
./tools/agent.sh enqueue "タイトル" --body "依頼内容"  # 無人実装キューに追加
./tools/experiment.sh <Issue番号>             # 実験ブランチで実装しプレビューへ
python3 tools/playtest/playtest.py --help     # 実ブラウザ自動プレイ
./tools/agent.sh              # 引数なしで使い方を表示
./tools/agent.sh fix --pr <n> # PRのBlockerを自動修正して再レビュー
./tools/agent.sh findings --pr <n>  # マージ後レビューのConsiderをIssue化
./tools/install-agent-planner.sh    # 週次提案のLaunchAgent登録
./tools/agent.sh status       # 無人実装キューの状態
./tools/automation-root.sh status  # LaunchAgent用main追従チェックアウト
./tools/agent.sh run --dry-run  # 実行対象の確認
./tools/install-agent-runner.sh  # 無人実装ランナーの LaunchAgent 登録
python3 -m http.server 8000   # ローカル確認
```

## 構成

- `apps.json` が公開アプリ一覧の正。`index.html` のカードと一致させる
- 各アプリは `projects/` 配下（分類は `projects/README.md`）に置き、`index.html`、`README.md`、`test-*.js` を持つ
- ゲームは `window.__GAME__`（`id` / `title` / `start` / `autoPlayStep` / `isDone` / `getState`）を公開する
- 共通のスモークテスト基盤は `tools/harness.js`

## ルール

- 依存ゼロの静的構成を基本とする。ビルドや外部ランタイムを増やす場合は、先に理由を `docs/decisions/` に記録する
- 公開 URL を壊さない。アプリのディレクトリ名やパスを変えるときはリダイレクトを用意する
- アプリを追加・変更したら、`apps.json`、`index.html`、`README.md`、テストを同じ変更で更新する
- アプリのCSS/JSを変更したら `index.html` の `?v=` も更新し、デプロイ直後の古いキャッシュ混在を防ぐ
- main へ直接 push せず、作業ブランチを作って PR を出す。main は branch protection で保護され、`tests` / `site` が必須
- PR のレビューは `pr-reviewer` subagent、マージは `pr-merger` subagent に任せる。レビュアーは編集・承認・マージをせず、マージ担当はレビュー・編集をしない
- 通常は PR を Ready にすれば、ローカルの watcher がレビューとマージを進める。作業中は Draft にするか `ai-pause` ラベルを付ける
- watcher を使わず即時実行する場合は `/pr-deliver <PR番号>` を使う。レビューだけなら `/pr-review`、マージだけなら `/pr-merge` を使う
- マージ前に `python3 tools/pr_merge.py --pr <PR番号>` の五点ゲートを通す。ゲートが失敗した状態でマージしない。`--admin`、`--auto`、直接の `gh pr merge` は使わない
- ユーザーはデプロイ済みのものを試して良し悪しを判断する。実装と検証が終わったら、追加確認なしで PR 作成、レビュー、五点ゲート、マージ、Pages 反映まで進めてよい（五点ゲートは省略しない）
- レビュー本文は `COMMENT` で投稿し、`APPROVE` / `REQUEST_CHANGES` は使わない。対象 head SHA と Blocker 数は `ai-pr-review` marker で記録する
- PR の本文は `.github/pull_request_template.md` に沿って書く。マージ前に `./tools/verify.sh` を通す
- コミットメッセージは `baseball-game: ...` のようにアプリ名または `repo:` で始め、日本語で理由が分かるように書く
- テストは利用者から見た挙動を検証する。実装の詳細やソース文字列の一致に依存しすぎない
- コメントはコードを読めば分かることを繰り返さず、なぜそうしたかを短く書く
- 判断の理由は `docs/`、アプリ固有の使い方は各アプリの `README.md` に書く
- 無人実装は `agent:ready` ラベルの Issue だけを対象にする。ランナーは push と PR 作成までで、マージは五点ゲートに任せる。停止は `./tools/agent.sh pause`
- 改善提案は planner が `agent:proposed` で作り、`./tools/agent.sh promote <n>` で実装キューに移す(既定)。詳細は [無人実装ランナー](docs/unattended-agents.md)
- ユーザーが PR や作業について相談・質問したら、まず「無人で実装できる」ことを短く伝える。依頼が明確で実行の指示があれば `/agent` または `./tools/agent.sh enqueue` でキューに追加する
