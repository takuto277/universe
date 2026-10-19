---
name: pr-merge
description: Use when asked to merge a pull request, run /pr-merge, or perform the merge phase of /pr-deliver. Runs the five-point gate and squash-merges only when every check passes.
---

# PR Merge

最新 head に対して五点ゲートを実行し、すべて通った場合だけ squash merge します。マージ担当はレビューや実装をしません。

## 五点ゲート

1. PR が open で、base が `main`、コンフリクトがなく merge 可能
2. 最新 head に対する AI レビューがあり、Blocker が 0
3. その head の required checks がすべて pass し、visible checks に failed / pending / cancelled がない
4. 未解決の review thread が 0
5. `ui-evidence` ラベルがある場合、最新 head を指す証跡コメントがある

## 手順

```sh
python3 tools/pr_merge.py --pr <n>
```

`pr_merge.py` は次を順に行います。

1. 五点ゲートを実行する。pending check は最大300秒待つ。
2. Draft なら Ready にする。
3. 最新 head が変わっていないことを確認して、もう一度ゲートを実行する。
4. `gh pr merge <n> --squash --match-head-commit <head>` でマージする。
5. `MERGED` になったことを確認する。

## 禁止事項

- ゲートが失敗した状態でマージしない。失敗理由を報告して停止する。
- `--admin`、`--auto`、`--delete-branch` を使わない。
- レビュー、ファイル編集、commit、push をしない。
- ゲートを迂回するために branch protection を変更しない。

## 報告

PR 番号、レビュー対象 head SHA、review ID、required / visible checks、未解決 thread 数、merge commit、マージ日時を報告します。
