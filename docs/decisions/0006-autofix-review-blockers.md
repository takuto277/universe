# 0006 PR の Blocker を自動修正して再レビューする

- Status: Accepted
- Date: 2026-10-22

## Context

ADR 0004 の watcher は、レビューで Blocker が出ると通知して停止し、修正は人間に任せていた。ADR 0005 の builder と runner があるため、レビュー指摘をそのまま builder に渡せば、実装と同じ安全策（worktree・検証・保護パス・タイムアウト）で修正できる。放置で直る範囲を広げたい。

## Decision

- `tools/agent_runner.py fix --pr <n>` を追加する
  - 最新 head の `ai-pr-review` marker（blockers > 0）から指摘を取得する
  - PR head を専用 worktree に checkout し、builder に Blocker の修正だけを指示する
  - `./tools/verify.sh` と保護パス検査を通したうえで、同じ head ブランチへ push する
  - マージはしない。修正後は必ず最新 head で再レビューを受ける
- watcher の Blocker 分岐から自動的に呼ぶ
  - 1 PR あたり最大3回、失敗は60分クールダウン
  - pause / Draft / `ai-pause` / `do-not-merge` を尊重する
  - `UNIVERSE_AUTO_PR_AUTOFIX=0` で無効化できる
- `tools/` と `.github/workflows/` の変更が必要な指摘は自動修正しない（検証を緩める変更を防ぐ）。人の対応に回す

## Consequences

良い面:

- アプリ・ドキュメントの PR は、Blocker が出ても人手なしで修正→再レビュー→マージまで進む
- 実装と同じ worktree・検証・保護パス・タイムアウトの仕組みを再利用できる
- マージ判断は五点ゲートのままで、独立性を保てる

制約:

- 自動修正の対象はアプリとドキュメントに限られる。tools/・CI の変更は人のレビューが必要
- 上限回数とクールダウンで無限ループは防ぐが、同じ指摘が続く場合は人に戻る
- モデルの利用回数と時間が増える
- 修正の品質は再レビューと五点ゲートに依存する

## Alternatives

- Blocker を人間が直す: 安全だが放置できない
- reviewer に修正もさせる: 独立性が失われ、レビューと実装の分離が崩れる
- CI の失敗だけを自動修正する: レビュー指摘（設計・テスト・ドキュメント）は対象外のまま
