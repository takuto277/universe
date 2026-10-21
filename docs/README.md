# ドキュメント

universe の開発・公開・学習に関するドキュメントです。目的から選んでください。

| 目的 | 文書 |
| --- | --- |
| アプリを追加する | [アプリの追加手順](adding-an-app.md) |
| ブランチ・PR・マージの流れを知る | [PR 運用](pr-workflow.md) |
| Issue をキューにして実装まで無人で進める | [無人実装ランナー](unattended-agents.md) |
| PR のレビューとマージを自動化する | [PR の自動レビューと自動マージ](auto-pr.md) |
| テストの書き方と実行方法を知る | [テスト](testing.md) |
| GitHub Pages への公開と URL の扱いを知る | [公開](deployment.md) |
| なぜこの構成なのかを知る | [0001 universe を静的モノレポとして維持する](decisions/0001-universe-as-static-monorepo.md) |
| AI に PR をレビュー・マージさせる仕組みを知る | [0003 PR のレビューとマージを分離した AI に任せる](decisions/0003-ai-review-and-merge.md) |
| PR 作成から自動で動かす判断を知る | [0004 PR のレビューとマージをローカル watcher で自動起動する](decisions/0004-auto-pr-watcher.md) |
| 実装まで無人で動かす判断を知る | [0005 Issue キューで実装まで無人実行する](decisions/0005-unattended-agent-runner.md) |
| Blocker の自動修正の判断を知る | [0006 PR の Blocker を自動修正して再レビューする](decisions/0006-autofix-review-blockers.md) |
| CodeRabbit を使っていたときの判断を知る | [0002 PR の承認を CodeRabbit に任せる](decisions/0002-ai-review-with-coderabbit.md) |
| 今後の改善予定を知る | [改善ロードマップ (Issue #22)](https://github.com/takuto277/universe/issues/22) |
| 学んだことを記録する | [学習ログ](learning-log.md) |

## 更新の原則

- `apps.json` を公開アプリ一覧の正とする
- アプリの追加・変更では、実装、テスト、README、一覧を同じ変更で更新する
- 判断の理由は ADR または学習ログに残し、コードコメントには短い理由だけを書く
