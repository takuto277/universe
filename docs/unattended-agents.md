# 無人実装ランナー

GitHub Issue を実装キューにして、builder エージェントを無人で実行し、PR を作るところまで自動化します。レビューとマージは既存の五点ゲート(と `auto-pr` watcher)が担当するため、「実装」と「マージ」の分離は保ったまま、夜間や離席中にも変更を進められます。

## 最短で使う

```sh
./tools/agent.sh enqueue "タイトル" --body "背景 / 提案 / 受け入れ条件 / 対象範囲"
./tools/agent.sh status
```

引数なしの `./tools/agent.sh` でも使い方を表示します。opencode では `/agent <依頼>` を使えます。

## 全体像

```text
Issue (agent:ready)
   │  tools/agent.sh run  (LaunchAgent が120秒ごと)
   ▼
builder エージェント (opencode, 専用 worktree)
   │  実装 → コミット → ./tools/verify.sh
   ▼
push agent/issue-<n> → PR 作成 (agent-generated)
   │  auto-pr watcher / 五点ゲート
   ▼
AI レビュー → Blocker 0 → squash merge
```

- 実装: `tools/agent_runner.py`(builder を起動)
- 提案: `tools/agent_runner.py propose`(planner が Issue を作る)
- レビュー・マージ: [PR 運用](pr-workflow.md) の五点ゲート(watcher 導入時は自動)

## セットアップ

前提: `gh` にログイン済みで、`opencode` が動くこと。

```sh
gh auth status
./tools/verify.sh
./tools/install-agent-runner.sh   # LaunchAgent 登録(120秒ごと)
./tools/agent.sh status
```

レビューとマージまで無人にするには、`auto-pr` watcher も登録します。

```sh
./tools/install-auto-pr.sh
```

未登録の間は、PR を `/pr-deliver` で処理してください。

## 使い方

### Issue をキューに入れる

```sh
./tools/agent.sh enqueue "janken-game: CPUのクセを2種類追加する" --body-file /tmp/issue.md
```

`agent:ready` ラベルが付いた Issue が実行対象です。GitHub 上でラベルを付けても同じです。
ラベルを付けられるのは書き込み権限を持つ人だけなので、第三者が勝手に実装キューへ入れることはできません。

### 手元で1件だけ実行する

```sh
./tools/agent.sh run --dry-run     # 対象の確認だけ
./tools/agent.sh run --issue 12    # 指定 Issue を実行
./tools/agent.sh run --verbose
```

### 提案からキューへ

```sh
./tools/agent.sh propose           # planner が最大3件の Issue を作る(既定は agent:proposed)
./tools/agent.sh promote 42        # 提案を実装キューへ移す
```

`UNIVERSE_AGENT_AUTO_READY_PROPOSALS=1` を設定すると、planner は最初から `agent:ready` で作り、承認なしで実装まで進みます。既定は人間の promote を挟む安全側です。

### 止める・再開する

```sh
./tools/agent.sh pause
./tools/agent.sh resume
```

一時停止は `~/.local/state/universe-agent-runner/pause` で行います。環境変数 `UNIVERSE_AGENT_DISABLE=1` でも止まります。

## ラベル

| ラベル | 意味 | 付ける人 |
| --- | --- | --- |
| `agent:ready` | 実装待ち | メンテナ / `enqueue` / `promote` |
| `agent:running` | 実行中 | runner |
| `agent:done` | 実装完了・PR 作成済み | runner |
| `agent:failed` | 失敗(理由は Issue コメント) | runner |
| `agent:proposed` | 改善提案(未承認) | planner |
| `agent-generated` | 無人エージェントが作成した PR | runner |

失敗した Issue をやり直すときは、原因を直したうえで `promote <番号>` を実行します(`agent:failed` / `agent:done` / `agent:running` を外して `agent:ready` に戻します)。実行中の Issue には使わないでください。

## 実行の流れ

1. `agent:ready` のうち番号が最も小さい Issue を1件取る
2. `agent:running` に付け替え、着手コメントを残す
3. `origin/main` から worktree と `agent/issue-<n>` ブランチを作る
4. builder をタイムアウト付きで実行する
5. 未コミットの変更があれば runner がコミットし、検証スクリプトの改変がないことを確認してから `./tools/verify.sh` を通す
6. push して PR を作成し、Issue を `agent:done` にする

PR の本文には `Closes #<n>` が入ります。マージされると Issue も閉じます。

## 安全策

- **1回1件・排他ロック**: `flock` で二重実行を防ぐ。プロセスが終了すると OS が自動で解放する
- **main へ push しない**: 触るのは `agent/` 配下のブランチと専用 worktree だけ。main への push は branch protection でも拒否される
- **マージしない**: レビューとマージは五点ゲートに任せる(`--admin` や直接マージは使わない)
- **builder の権限は allowlist**: 既定 deny で、git の読み書き・commit、verify、jsc、読み取り系ユーティリティだけを許可する。`git push`、`gh`、`rm`、ネットワーク、外部ディレクトリは拒否する
- **検証のすり抜け防止**: verify は worktree 側で実行し、`tools/` 配下と `.github/workflows/` が変更されていたら失敗させる。さらに信頼するチェック(site 検査・構文検査・runner テスト)をアプリのテストより先に実行し、テスト JS による差し替えを防ぐ
- **状態不明なら中止**: PR 一覧の取得失敗など、既存 PR の有無を確認できない場合はブランチを消さずに止める
- **pause は公開直前にも確認**: 実行開始時に加えて、push と PR 作成の直前にも pause を確認する
- **タイムアウト**: エージェント既定 2700 秒、verify 600 秒。超えたらプロセスグループごと終了する
- **実行の隔離**: `seatbelt` では書き込み先と秘密ファイルの読み取りを制限する。ただしネットワークは許可しており、サンドボックスではない部分が残る
- **失敗時**: `agent:failed` とコメント(理由・ログパス)を残し、worktree を片付ける。自動リトライはしない
- **レビュー指摘の自動修正**: `fix --pr` は PR head の worktree で Blocker だけを直し、verify 後に同じ head ブランチへ push する。マージはせず、必ず再レビューを受ける。`tools/` と CI の変更が必要な指摘は対象外
- **提案の既定**: `agent:proposed` で止め、人間の `promote` を待つ
- **入力の信頼**: Issue 本文はそのまま builder への指示になる。`agent:ready` を付けられるのは書き込み権限を持つ人だけなので、第三者が勝手にキューへ入れることはできない
- **単一ホスト前提**: ロックはローカルの state dir 単位。複数ホストや state dir を分けた同時実行は想定しない
- **限界**: 権限パターンはサンドボックスではない。OS ユーザの分離やコンテナ実行は今後の強化とする。最終的な安全網は branch protection、五点ゲート、AI レビュー

## 実行の隔離（sandbox-exec）

`UNIVERSE_AGENT_SANDBOX=seatbelt` を設定すると、builder と `verify.sh` を macOS の `sandbox-exec` で包みます。既定は `none` です。

- 書き込みは worktree・state dir・リポジトリの `.git`・一時ディレクトリ・opencode の設定/データだけに許可します
- 読み取りは既定で許可しつつ、`~/.ssh`、`~/.aws`、`~/.config/gh`、`~/Library/Keychains`、`~/Documents` などを明示的に拒否します
- ネットワークはモデル API のために許可します（完全なネットワーク遮断ではありません）
- `sandbox-exec` は非推奨の仕組みです。より強い隔離が必要な場合は、専用 OS ユーザやコンテナの利用を検討してください

```sh
UNIVERSE_AGENT_SANDBOX=seatbelt ./tools/install-agent-runner.sh
```

`./tools/agent.sh status` で `sandbox: seatbelt` と表示されます。Launcher の環境変数は plist に保存されるため、変更時は再インストールしてください。

## 設定

| 環境変数 | 既定 | 説明 |
| --- | --- | --- |
| `UNIVERSE_AGENT_REPO` | `takuto277/universe` | 対象リポジトリ |
| `UNIVERSE_AGENT_BASE` | `main` | ベースブランチ |
| `UNIVERSE_AGENT_MODEL` | `opencode/deepseek-v4.1-flash-free` | 使用モデル |
| `UNIVERSE_AGENT_AGENT` | `builder` | 実装エージェント |
| `UNIVERSE_AGENT_PLANNER_AGENT` | `planner` | 提案エージェント |
| `UNIVERSE_AGENT_TIMEOUT` | `2700` | エージェントのタイムアウト秒 |
| `UNIVERSE_AGENT_VERIFY_TIMEOUT` | `600` | verify のタイムアウト秒 |
| `UNIVERSE_AGENT_STATE_DIR` | `~/.local/state/universe-agent-runner` | ロック・worktree・ログ・`history.jsonl`・`running/`（実行中マーカー） |
| `UNIVERSE_AGENT_LOG` | `~/Library/Logs/universe-agent-runner.log` | 実行ログ |
| `UNIVERSE_AGENT_AUTO_READY_PROPOSALS` | `0` | 提案をそのまま実装キューへ入れる |
| `UNIVERSE_AGENT_KEEP_WORKTREE` | `0` | 失敗調査用に worktree を残す |
| `UNIVERSE_AGENT_NOTIFY` | `1` | macOS 通知の on/off |
| `UNIVERSE_AGENT_FIX_MAX` | `3` | 1 PR あたりの自動修正回数の上限 |
| `UNIVERSE_AGENT_FIX_TIMEOUT` | `1500` | 自動修正エージェントの上限秒数 |
| `UNIVERSE_AGENT_SANDBOX` | `none` | `seatbelt` で builder と verify を隔離する |
| `UNIVERSE_AGENT_STALL_MINUTES` | `90` | `agent:running` のまま通知するまでの分数(0で無効) |
| `UNIVERSE_AGENT_DISABLE` | `0` | `1` で実行を止める(pause と同じ) |
| `UNIVERSE_AGENT_BRANCH_PREFIX` | `agent/` | ブランチ接頭辞 |
| `GH_BIN` / `GIT_BIN` / `OPENCODE_BIN` | `gh` / `git` / `opencode` | 実行ファイルの差し替え(上級者向け) |
| `UNIVERSE_AGENT_INTERVAL` | `120` | LaunchAgent の実行間隔(インストール時) |

## 運用

```sh
./tools/agent.sh status      # キュー・ロック・直近の実行履歴
tail -n 50 ~/Library/Logs/universe-agent-runner.log
```

- 成功・失敗・滞留は macOS の通知で知らせます(`UNIVERSE_AGENT_NOTIFY=0` で停止)
- 実行履歴は `~/.local/state/universe-agent-runner/history.jsonl` に残り、`status` で直近5件を表示します
- `agent:running` のまま `UNIVERSE_AGENT_STALL_MINUTES` を超えた Issue は一度だけ通知します
- 滞留通知は runner 実行時に確認するため、`UNIVERSE_AGENT_TIMEOUT` を滞留時間より長くすると、固まった実行は検出できません（timeout を短くするか、別プロセスの監視が必要）

- LaunchAgent は 120 秒ごとに起動する。Mac がスリープ中は遅延する
- 実行ログは `~/.local/state/universe-agent-runner/logs/issue-<n>-<ts>.log` に残し、14日より古いものを削除する
- 失敗の切り分けは Issue コメント → 個別ログ → `git worktree list` の順で見る
- `pause` は「次に push / PR を作る前」で止まる。すでに PR 作成済みのものは止まらない
- 実行ログのない失敗や状態不明時は、ブランチを消さずに `agent:failed` で止まる。原因を直して `promote` で戻す
- 強制終了などで `agent:running` のまま残った Issue は、原因を確認して `./tools/agent.sh promote <n>` で戻す。ロックは flock なのでプロセス終了時に自動で解放される(`~/.local/state/universe-agent-runner/lock` は残っても、次回起動は妨げない)
- 並行して `auto-pr` watcher が動いていても、実装とレビューで役割が分かれているため競合しない

## テスト

```sh
python3 tools/test_agent_runner.py
```

`gh` / `git` / `opencode` を fake に差し替え、キュー取得、ラベル遷移、worktree 作成、verify 失敗、タイムアウト、既存 PR のスキップ、pause、排他ロックと旧ロック移行、提案モード、通知の有効/無効、実行履歴、滞留通知の重複防止、ログのサイズ上限を検証します。

## 制約

- Mac がログイン状態で起動している必要がある(GitHub Actions では動かさない)
- opencode の認証とモデルの利用枠に依存する
- 1件ずつ・自動リトライなし。並列実行や失敗の無限ループはしない
- 生成物の品質は最終的に五点ゲートと AI レビューで担保する
- アプリの `test-*.js` は verify の中で任意コードを実行できる。verify 後の再検査でファイル変更は検出するが、完全なサンドボックスではない(信頼できる Issue だけをキューに入れる前提)
- `tools/` 配下や CI の変更は無人では通さない(人間のレビューが必要)。調査したいときは `UNIVERSE_AGENT_KEEP_WORKTREE=1` で再実行して worktree を残す
- 検証失敗時、Issue コメントには要点だけを書き、verify の生出力はローカルの実行ログに残す
