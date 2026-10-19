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

6. CI の `tests` と `site` が通ることを確認する

   ```sh
   gh pr checks --watch
   ```

7. 問題がなければ main にマージする

   ```sh
   gh pr merge --merge
   ```

   このリポジトリでは、コミット単位の履歴を残すために merge commit を基本とします。squash に統一したい場合は、リポジトリ設定でマージ方法を固定してください。

## main の保護

`main` には次の設定を適用します。

- pull request を必須にする（自分のリポジトリなので承認者数は 0）
- `tests` と `site` の status check を必須にする
- 管理者も保護を回避できないようにする
- force push とブランチ削除を禁止する

設定は GitHub の `Settings > Branches` から変更できます。CLI で設定する場合は `gh api` を使います。

## マージ後にやること

```sh
git switch main
git pull --ff-only
git branch -d feat/my-change
```

リモートブランチも消す場合は、PR 作成時に `--delete-branch` を付けるか、マージ後に削除します。
