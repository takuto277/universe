# 0003 PR のレビューとマージを分離した AI に任せる

- Status: Accepted
- Date: 2026-10-19

## Context

ADR 0002 では CodeRabbit の approving review を必須にした。しかし、CodeRabbit の障害中は承認が得られず、リポジトリの変更が止まる。外部サービスの可用性にマージ可否を依存させず、レビューとマージの工程を AI で完結させたい。

参考にした u7chan/agent-harness の運用では、レビュアーとマージ担当を別エージェントに分け、レビュアーは `COMMENT` レビューだけを投稿し、マージ担当が最新 head に対する五点ゲートを通してから squash merge する。GitHub の required approvals は 0 で、ゲートはエージェントの手順として実行される。

## Decision

- CodeRabbit の自動レビューと status check を無効化し、必須承認と必須 check から外す
- `main` の required approvals を 0 にする
- `tests` と `site` は引き続き必須 check にする
- PR を必須にし、force push とブランチ削除を禁止し、管理者にも保護を適用する
- マージ方法は squash のみにする
- レビューは `pr-reviewer`、マージは `pr-merger` という別の opencode subagent が担当する
- レビュアーは `COMMENT` レビューだけを投稿し、`APPROVE`、`REQUEST_CHANGES`、編集、マージをしない
- レビュー本文には `ai-pr-review` marker を付け、対象 head SHA と Blocker 数を機械可読に記録する
- マージ担当は `tools/pr_merge.py` を実行し、次の五点ゲートがすべて通った場合だけ `gh pr merge --squash --match-head-commit` を使う
  1. open、base が `main`、コンフリクトなしで merge 可能
  2. 最新 head の AI レビューで Blocker 0
  3. その head の required checks がすべて pass し、visible checks に failed / pending / cancelled がない
  4. 未解決 review thread が 0
  5. `ui-evidence` ラベルがある場合、最新 head を指す証跡コメントがある
- レビューとマージは `/pr-review`、`/pr-merge`、`/pr-deliver` から実行する
- PR を Ready にした後の自動起動は [0004](0004-auto-pr-watcher.md) で追加する

## Consequences

良い面:

- 外部 SaaS の障害にマージ可否が依存しない
- レビュー担当とマージ担当が分離され、レビュアーが自分の指摘を勝手に通せない
- レビュー対象 SHA、Blocker 数、CI、thread、merge commit が PR に残る
- squash merge により main の履歴が 1 PR = 1 commit になる

制約:

- レビューは PR 作成時に自動では走らない。opencode で `/pr-review` または `/pr-deliver` を実行する必要がある
- 五点ゲートは GitHub の branch protection ではなく、`tools/pr_merge.py` の手順で担保する。マージ権限を持つ人がスクリプトを迂回すれば通せる
- AI レビューは誤る可能性がある。Blocker の判定基準とテストを維持する
- `ui-evidence` ラベルを付けた PR は、最新 head を指す証跡コメントが必要になる

## 運用

- 通常は `/pr-deliver <PR番号>` を使い、レビュー、修正、再レビュー、マージを最大3ラウンドで完遂する
- レビューだけなら `/pr-review <PR番号>`、マージだけなら `/pr-merge <PR番号>` を使う
- ゲートが失敗した場合は、理由を確認して修正する。ゲートを迂回しない
- CodeRabbit App が残っている場合は、GitHub の設定からアンインストールしてよい
- 将来、ゲートを GitHub 側でも強制する場合は、`merge-gate` を required check にする

## Alternatives

- CodeRabbit を継続する: 障害時にマージが止まるため、今回の目的に合わない
- GitHub Actions から LLM API を呼ぶ: API キーと承認権限の管理が必要で、今の規模では見送る
- 人間がレビューとマージをする: 個人開発で第三者を継続的に確保できないため見送る
