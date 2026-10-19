# 0002 PR の承認を CodeRabbit に任せる

- Status: Accepted
- Date: 2026-10-19

## Context

universe は個人開発のリポジトリで、main への変更は pull request と `tests` / `site` の必須チェックで保護しています。ただし承認者数は 0 にしており、CI が通れば自分でマージできます。変更の質を一定以上に保つため、レビューと承認の工程を AI に任せたいと考えました。

検討した選択肢:

- GitHub Actions から AI API を呼び、`GITHUB_TOKEN` で approving review を出す
- GitHub Copilot code review の承認機能を使う
- CodeRabbit の GitHub App を使う
- AI レビューを必須 status check にするだけにして、承認は自分で行う

GitHub Actions が approving review を出すには、リポジトリ設定 `can_approve_pull_request_reviews` を有効にする必要があります。これはセキュリティ上のリスクがある設定で、公開リポジトリでは fork からの PR も考慮する必要があります。GitHub Copilot の承認は Copilot Pro 以上のプランが前提です。GitHub Models は 2026-07-30 に終了しています。

CodeRabbit は public repository を無料でレビューでき、OSS 向けに Team 相当の機能が提供されています。`request_changes_workflow` を有効にすると、指摘が解決した時点で approving review を出せるため、GitHub の required approvals をそのまま使えます。

## Decision

- CodeRabbit の GitHub App をリポジトリに導入する
- `.coderabbit.yaml` で日本語レビューと `request_changes_workflow` を有効にする
- 作者自身の `@coderabbitai approve` / `resolve` は禁止する（`allow_author_approval: false`）
- main の branch protection は required approvals を 1 にし、`tests` と `site` は必須のままにする
- 新しい push で古い承認を無効にし、最後の push に対する承認を必須にする
- review thread が未解決の間はマージできないようにする
- GitHub Actions の `can_approve_pull_request_reviews` は有効にしない

## Consequences

良い面:

- 自分では承認できない PR に、独立した AI の承認を要求できる
- CI に加えて、コードの契約・テスト・ドキュメントの整合性をレビューできる
- GitHub Actions に承認権限を渡さずに済む
- 指摘と修正の履歴が PR に残る

制約:

- CodeRabbit にリポジトリのコードとメタデータへのアクセスを許可する必要がある
- AI の承認は誤る可能性がある。最終的なマージ判断は自分で行う
- CodeRabbit が停止・レート制限・設定不備のときは、承認が得られずマージできない
- public repository を前提とする。private に移す場合は料金と設定を見直す

## 運用

- CodeRabbit の指摘は、修正するか、理由をコメントして resolve する
- 修正を push したら、CodeRabbit の再レビューと再承認を待つ
- CodeRabbit が使えない緊急時は、branch protection を一時的に緩めてマージし、復旧後に設定を戻す
- 設定や運用を変えるときは、この ADR と `docs/pr-workflow.md` を更新する

## Alternatives

- 自前の AI レビューワークフロー: API キー管理と Actions への承認権限付与が必要になるため、今の規模では見送る
- GitHub Copilot code review: Copilot Pro 以上が前提で、無料枠では承認を必須にできないため見送る
- AI レビューを必須 status check にするだけ: 安全だが、GitHub の承認としては記録されないため、今回の目的に合わない
- 人間のレビュー: 個人開発で第三者を継続的に確保できないため見送る
