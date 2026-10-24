# 0008 レビュー指摘を Issue 化し、週次で提案する

- Status: Accepted
- Date: 2026-10-22

## Context

ADR 0006 で Blocker は自動修正できるようになったが、レビューの Consider / Nit は読まれて終わっていた。planner も手動実行だけで、改善の入口が人間の思いつきに依存していた。改善ループを閉じたい。

## Decision

- **マージ後**に、Consider 指摘だけを `agent:proposed` の Issue として1つにまとめる（Nit/FYIはPRコメント）
  - watcher から `agent_runner.py findings --pr <n>` を呼ぶ
  - 1 PR 1 Issue（チェックリスト）。`review-findings pr=<n>` marker で重複を防ぐ
  - チェックリストの上限を `UNIVERSE_AGENT_FINDINGS_MAX`（既定5）で制限する
  - `UNIVERSE_AUTO_PR_CREATE_ISSUES=0` で無効化できる
- 週次で planner を実行する LaunchAgent（`install-agent-planner.sh`、月曜09:00）を追加する
- 提案は既定で `agent:proposed` に留め、人間の `promote` を待つ。`UNIVERSE_AGENT_AUTO_READY_PROPOSALS=1` のときだけ自動で実装キューに入れる

## Consequences

良い面:

- レビューの指摘が失われず、後から実装キューに移せる
- 提案が定期的に作られ、ネタ切れしない
- 重複・上限・ラベルで暴走を防げる
- 自動作成された Issue は既存の無人実装キューにそのまま乗る

制約:

- 指摘の粒度はレビュー本文に依存し、大きすぎる Issue は `promote` 前に分割が必要
- 週次 planner は Mac のログイン中にしか動かない
- `agent:proposed` の Issue が溜まるため、定期的な整理が必要
- 自動実装まで進めるには `promote` か `AUTO_READY_PROPOSALS` の明示が必要

## Alternatives

- レビュー指摘を自動で実装する: 指摘の意図確認が難しく、無関係な変更を招く
- planner のみ手動: 改善の入口が人間の思いつきに依存する
- 指摘を PR コメントのままにする: 見落としやすく、追跡できない
