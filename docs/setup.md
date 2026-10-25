# 新しい Mac でのセットアップ

universe の開発・無人実行に必要な環境を確認し、LaunchAgent までまとめて登録します。

## 最短手順

新規の Mac では、前提ツールを入れてから setup を実行します。前提が欠けていると `--with-agents` / `--verify` は登録・実行の前に中止するため、先に MISS を解消してください。

```sh
git clone https://github.com/takuto277/universe.git
cd universe

# 1. git / python3 / jsc を入れる
xcode-select --install

# 2. opencode を公式手順でインストールする: https://opencode.ai/docs/

# 3. gh を導入して認証する（--install は Homebrew がある場合のみ）
./tools/setup.sh --install   # 未認証だと exit 1。続けて認証する
gh auth login

# 4. 前提の確認、LaunchAgent の登録、verify
./tools/setup.sh --with-agents --verify
```

`--install` は不足している `gh` だけを Homebrew で導入し、opencode は自動では入れません。Homebrew が無い場合は https://cli.github.com/ から `gh` を入れてください。

`--with-agents` は runner（実装キュー）・watcher（レビュー/マージ）・planner（週次提案）を登録します。`UNIVERSE_AGENT_SANDBOX=seatbelt` を既定で使い、エージェントが実行する builder と verify を sandbox で実行します。

LaunchAgent は、人間が作業しているチェックアウトとは別の **main 追従の専用チェックアウト** から動きます。既定は `~/.local/share/universe-automation` です。

- 起動のたびに `origin/main` へ自動更新します（失敗時は現在の版で続行し、ログに残します）
- 手動確認・更新・削除:

```sh
./tools/automation-root.sh status
./tools/automation-root.sh update
./tools/automation-root.sh remove
```

- パスを変える場合: `UNIVERSE_AUTOMATION_ROOT=/path ./tools/setup.sh --with-agents`
- 専用チェックアウトは元リポジトリの linked worktree です。元チェックアウトを移動・削除すると壊れるため、削除は `./tools/automation-root.sh remove` を使ってください
- ブランチをチェックアウトした worktree は指定できません（detached HEAD のみ）

## 前提

`tools/setup.sh` が次を確認します。

| 項目 | 用途 | 入手方法 |
| --- | --- | --- |
| macOS | LaunchAgent / sandbox-exec | - |
| git | リポジトリ操作 | `xcode-select --install` |
| python3 (3.9+) | ツール・テスト | `xcode-select --install` |
| jsc | アプリのテスト | Xcode Command Line Tools に同梱 |
| sandbox-exec | 実行の隔離 | macOS 標準 |
| gh | Issue/PR 操作 | https://cli.github.com/ または `brew install gh` |
| opencode | AI レビュー・実装 | https://opencode.ai/docs/ |
| gh 認証 | PR・Issue 操作 | `gh auth login` |
| opencode 認証 | モデル利用 | `opencode` の初回セットアップ（setup は存在のみ確認） |

Homebrew がある場合、`--install` で不足している `gh` だけを導入します。opencode は公式手順で入れてください（`curl | bash` を勝手に実行しないため）。

## 何をするか

1. コマンドと gh 認証を確認する
2. MISS がある場合、`--with-agents` と `--verify` は何もせずに終了コード1で終わる
3. `--with-agents` のとき、すべて OK なら LaunchAgent を登録する
4. `--verify` のとき、すべて OK なら `./tools/verify.sh` を実行する

エージェントの状態は次で確認できます。

```sh
./tools/agent.sh status
./tools/auto-pr.sh --dry-run
launchctl print gui/$(id -u)/com.takuto277.universe-agent-runner | grep -E 'state|UNIVERSE'
```

## よくあるつまずき

| 症状 | 対処 |
| --- | --- |
| `jsc` が見つからない | `xcode-select --install` を実行し、`/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc` があるか確認 |
| `gh` が未認証 | `gh auth login` |
| opencode が動かない | 公式手順でインストールし、認証とモデル設定を確認（setup は認証を確認しません） |
| 「未解決の項目があるため…中止します」と出る | 上の MISS を解消してから `--with-agents --verify` を再実行する（新規 Mac は上の最短手順の順番で入れる） |
| LaunchAgent が動かない | Mac にログイン中か、スリープしていないか確認。`launchctl print` で状態を見る |
| sandbox で失敗する | `UNIVERSE_AGENT_SANDBOX=none` で切り分け、原因を確認して戻す |

## 制約

- LaunchAgent はユーザーのログイン中だけ動きます。スリープ中は遅延し、起床後に再開します
- Dependabot が作る PR は watcher の対象外です（必要なら `/pr-deliver`）
- 秘密情報はコミットしないでください。詳細は [SECURITY.md](../SECURITY.md) を参照
