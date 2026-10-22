# 新しい Mac でのセットアップ

universe の開発・無人実行に必要な環境を確認し、LaunchAgent までまとめて登録します。

## 最短手順

```sh
git clone https://github.com/takuto277/universe.git
cd universe
./tools/setup.sh --with-agents --verify
```

`--with-agents` は runner（実装キュー）・watcher（レビュー/マージ）・planner（週次提案）を登録します。`UNIVERSE_AGENT_SANDBOX=seatbelt` を既定で使い、builder と verify を sandbox で実行します。

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
| opencode 認証 | モデル利用 | `opencode` の初回セットアップ |

Homebrew がある場合、`--install` で不足している `gh` だけを導入します。opencode は公式手順で入れてください（`curl | bash` を勝手に実行しないため）。

## 何をするか

1. コマンドと認証を確認し、MISS があれば終了コード1で止まる
2. `--with-agents` のとき、すべて OK なら LaunchAgent を登録する
3. `--verify` のとき、`./tools/verify.sh` を実行する

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
| opencode が動かない | 公式手順でインストールし、認証とモデル設定を確認 |
| LaunchAgent が動かない | Mac にログイン中か、スリープしていないか確認。`launchctl print` で状態を見る |
| sandbox で失敗する | `UNIVERSE_AGENT_SANDBOX=none` で切り分け、原因を確認して戻す |

## 制約

- LaunchAgent はユーザーのログイン中だけ動きます。スリープ中は遅延し、起床後に再開します
- Dependabot が作る PR は watcher の対象外です（必要なら `/pr-deliver`）
- 秘密情報はコミットしないでください。詳細は [SECURITY.md](../SECURITY.md) を参照
