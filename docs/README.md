# ドキュメント

universe の開発・公開・学習に関するドキュメントです。目的から選んでください。

| 目的 | 文書 |
| --- | --- |
| アプリを追加する | [アプリの追加手順](adding-an-app.md) |
| ブランチ・PR・マージの流れを知る | [PR 運用](pr-workflow.md) |
| テストの書き方と実行方法を知る | [テスト](testing.md) |
| GitHub Pages への公開と URL の扱いを知る | [公開](deployment.md) |
| なぜこの構成なのかを知る | [0001 universe を静的モノレポとして維持する](decisions/0001-universe-as-static-monorepo.md) |
| AI に PR を承認させる仕組みを知る | [0002 PR の承認を CodeRabbit に任せる](decisions/0002-ai-review-with-coderabbit.md) |
| 学んだことを記録する | [学習ログ](learning-log.md) |

## 更新の原則

- `apps.json` を公開アプリ一覧の正とする
- アプリの追加・変更では、実装、テスト、README、一覧を同じ変更で更新する
- 判断の理由は ADR または学習ログに残し、コードコメントには短い理由だけを書く
