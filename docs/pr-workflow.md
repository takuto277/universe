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

6. AI にレビューとマージを任せる

   opencode で次のどちらかを実行します。

   ```text
   /pr-deliver 123
   ```

   `/pr-deliver` は「レビュー → Blocker 修正 → 再レビュー → 五点ゲート → squash merge」を最大3ラウンドで行います。レビューだけ、マージだけを分けて実行する場合は `/pr-review 123`、`/pr-merge 123` を使います。

## AI レビュー

レビューは `pr-reviewer` subagent、マージは `pr-merger` subagent が担当します。両者は別の役割で、レビュアーは編集・承認・マージをせず、マージ担当はレビュー・編集をしません。

レビュアーは `COMMENT` レビューだけを投稿します。GitHub の `APPROVE` は使いません。レビュー本文には次の marker が自動で付き、マージゲートが対象 head と Blocker 数を検証します。

```text
<!-- ai-pr-review
{"version":1,"head":"<sha>","blockers":0,"findings":0,"reviewer":"opencode"}
-->
```

レビューの観点と手順は [`.opencode/skills/pr-review/SKILL.md`](../.opencode/skills/pr-review/SKILL.md) にあります。CodeRabbit は無効化しており、必須承認にも必須 check にも含めません。

## 五点ゲート

マージ担当は `python3 tools/pr_merge.py --pr <n>` を実行します。ゲートは次の5点を確認します。

1. PR が open で、base が `main`、コンフリクトがなく merge 可能
2. 最新 head に対する AI レビューがあり、Blocker が 0
3. その head の required checks（`tests`、`site`）がすべて pass し、visible checks に failed / pending / cancelled がない
4. 未解決の review thread が 0
5. `ui-evidence` ラベルがある場合、最新 head を指す証跡コメントがある

すべて通ると Draft を Ready にし、head SHA を固定して squash merge します。

```sh
python3 tools/pr_merge.py --pr 123
```

ゲートが失敗した場合はマージしません。`--admin`、`--auto`、`--delete-branch` は使いません。

## main の保護

`main` には次の設定を適用します。

- pull request を必須にする
- required approvals を 0 にする
- `tests`、`site` の status check を必須にする
- 管理者も保護を回避できないようにする
- force push とブランチ削除を禁止する
- マージ方法は squash のみにする

レビューとマージのゲートは GitHub の required review ではなく、`tools/pr_merge.py` の五点ゲートで担保します。マージ権限を持つ人がスクリプトを使わずに UI からマージすることは技術的には可能なので、通常は `/pr-deliver` か `/pr-merge` を使ってください。

## UI 証跡

見た目の変更を含む PR で証跡を必須にする場合は、`ui-evidence` ラベルを付けます。マージ担当は、次の marker を含むコメントが最新 head を指していることを確認します。

```text
<!-- ui-evidence: <head SHA> -->
```

証跡コメントはオーケストレーターが PR に投稿します。スクリーンショットや動画の添付方法は、変更内容に応じて PR 本文に書きます。

## マージ後にやること

```sh
git switch main
git pull --ff-only
git branch -d feat/my-change
```

リモートブランチは GitHub の設定で自動削除するか、マージ後に削除します。
