# PR 運用

main は branch protection で保護し、変更は必ず pull request 経由にします。個人開発でも、変更の理由と検証結果を残すためにこの流れを使います。

## 基本の流れ

1. 作業ブランチを作る

   ```sh
   git switch main
   git pull --ff-only
   git switch -c feat/my-change
   ```

2. 実装、テスト、README、`apps.json`、`index.html` を更新する

3. ローカルで検証する

   ```sh
   ./tools/verify.sh
   ```

4. ブランチを push する

   ```sh
   git push -u origin feat/my-change
   ```

5. PR を作る

   ```sh
   gh pr create --fill
   ```

   本文は `.github/pull_request_template.md` に沿って埋めます。

6. CI の `tests` と `site`、CodeRabbit のレビュー結果を確認する

   ```sh
   gh pr checks --watch
   ```

   CodeRabbit が指摘した場合は、修正するか理由をコメントして resolve し、再レビューを受けます。

7. CodeRabbit の承認が付いたら main にマージする

   ```sh
   gh pr merge --merge
   ```

   このリポジトリでは、コミット単位の履歴を残すために merge commit を基本とします。squash に統一したい場合は、リポジトリ設定でマージ方法を固定してください。

## main の保護

`main` には次の設定を適用します。

- pull request を必須にし、承認者数を 1 にする（CodeRabbit の approving review で満たす）
- `tests` と `site` の status check を必須にする
- 新しい push で古い承認を無効にし、最後の push に対する承認を必須にする
- 未解決の review thread がある間はマージできないようにする
- 管理者も保護を回避できないようにする
- force push とブランチ削除を禁止する

設定は GitHub の `Settings > Branches` から変更できます。CLI で設定する場合は `gh api` を使います。

## AI レビュー（CodeRabbit）

PR のレビューと承認は CodeRabbit に任せます。設定の判断理由は [ADR 0002](decisions/0002-ai-review-with-coderabbit.md) にあります。

### 初回セットアップ

1. [CodeRabbit の GitHub App](https://github.com/marketplace/coderabbitai) をインストールする
2. リポジトリへのアクセスは `takuto277/universe` だけに絞る
3. リポジトリ直下の `.coderabbit.yaml` が使われていることを確認する
4. branch protection の承認者数を 1 に設定する

### レビューの流れ

1. PR を作ると CodeRabbit が自動でレビューする
2. 修正が必要な指摘があると `request changes` になり、マージがブロックされる
3. 指摘を修正するか、対応しない理由をコメントして thread を resolve する
4. 最新コミットがレビューされ、未解決 thread と pre-merge check がなくなると CodeRabbit が承認する
5. `tests` と `site` が通り、承認が 1 つあればマージできる

作者自身の `@coderabbitai approve` / `@coderabbitai resolve` は `allow_author_approval: false` で禁止しています。承認を急ぐ場合も、自分のコメントで承認を付けず、レビュー指摘に対応してください。

### CodeRabbit が使えないとき

CodeRabbit の障害やレート制限で承認が得られない場合は、GitHub の `Settings > Branches` で `main` の承認者数を一時的に 0 にします。マージ後は、必ず承認者数を 1 に戻します。

一時的に緩めた理由とマージした PR は、PR のコメントか `docs/learning-log.md` に残します。

## マージ後にやること

```sh
git switch main
git pull --ff-only
git branch -d feat/my-change
```

リモートブランチも消す場合は、PR 作成時に `--delete-branch` を付けるか、マージ後に削除します。
