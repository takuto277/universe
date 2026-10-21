# 0005 Issue キューで実装まで無人実行する

- Status: Accepted
- Date: 2026-10-20

## Context

ADR 0003 で PR のレビューとマージは自動化したが、実装の開始は人間の依頼に依存していた。u7chan の `code-agent-launcher` のように、エージェントを無人で起動して夜間にも実装を進めたい。一方で、実装とマージを同じエージェントに任せると、レビューの独立性と五点ゲートが形骸化する。

## Decision

- GitHub Issue を実装キューにする。`agent:ready` ラベルが付いた Issue だけを対象にする
- macOS の LaunchAgent から `tools/agent_runner.py run` を120秒ごとに実行する
- 1回につき1件、専用 worktree と `agent/issue-<n>` ブランチで builder を実行する
- builder はコミットまで。push・PR 作成・マージはしない。runner が verify と push、PR 作成を行う
- レビューとマージは ADR 0003 の五点ゲートと watcher に任せる
- 改善提案は planner が `agent:proposed` で作り、人間の `promote` を経て実装キューに入れる(既定)
- 安全策として、flock による排他ロック、pause ファイル、タイムアウト、deny-by-default の権限 allowlist(push / gh / rm / ネットワークを拒否)、失敗時のラベルとコメントを設ける
- verify は worktree 側で実行し、検証スクリプトと CI の変更を検出したら失敗させる

## Consequences

良い面:

- 夜間や離席中も、承認済みの Issue が PR になるところまで進む
- 実装(builder)とレビュー・マージ(五点ゲート)が分離されたまま
- 失敗しても Issue に理由とログが残り、リトライは明示的に行う
- 既存の `gh` / opencode の認証を使うため、追加の API キーが不要

制約:

- Mac がログイン状態で起動している必要がある
- opencode の認証とモデルの利用枠に依存する
- 1件ずつで自動リトライはしない。スループットは高くない
- 提案をそのまま実装させるには `UNIVERSE_AGENT_AUTO_READY_PROPOSALS=1` を明示する必要がある
- 生成物の品質は五点ゲートと AI レビューに依存する
- 権限パターンはサンドボックスではない。OS ユーザ分離やコンテナ実行は今後の課題

## Alternatives

- GitHub Actions で LLM を呼ぶ: Mac の起動に依存しないが、API キーを Secrets に置く必要があり、ローカルの認証を再利用できない
- 実装も auto-pr watcher に任せる: 1つのエージェントが実装・レビュー・マージを兼ね、独立性が失われる
- ラベルなしで open Issue をすべて実装する: 意図しない Issue や議論中の Issue まで実行する危険がある
