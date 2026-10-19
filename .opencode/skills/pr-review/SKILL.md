---
name: pr-review
description: Use when asked to review a pull request, run /pr-review, or perform the review phase of /pr-deliver. Posts a COMMENT review with the ai-pr-review marker and never approves or merges.
---

# PR Review

Pull request の最新 head を独立にレビューし、`COMMENT` レビューとして記録します。レビュアーは実装・修正・承認・マージを行いません。

## 安全条件

- ファイルを編集しない。commit / push をしない。
- `APPROVE` レビュー、`REQUEST_CHANGES` レビュー、マージ、Issue close をしない。
- review thread を resolve しない。指摘はレビュー本文に書く。
- レビュー対象は `gh pr view` で固定した head SHA とする。投稿直前に head が変わっていたら、投稿せずに報告する。
- `python3 tools/pr_review.py` だけがレビューを投稿する。`gh pr review --approve` や `gh api` による独自投稿は使わない。

## 手順

1. PR の基本情報と head を固定する。

   ```sh
   gh pr view <n> --json number,title,body,state,isDraft,headRefOid,baseRefName,url,reviews,comments
   gh pr diff <n>
   gh pr checks <n>
   ```

2. PR の目的、Issue、受け入れ条件、変更範囲、既存の契約、テスト、ドキュメントを読む。必要なら `git show <head>:<path>` で最新 head のファイルを読む。

3. 次の観点で、差分によって発生する具体的な失敗経路だけを調べる。

   - 正しさ: 状態遷移、境界値、エラー処理、null / undefined、非同期処理
   - 契約: `window.__GAME__`（`id` / `title` / `start` / `autoPlayStep` / `isDone` / `getState`）、`apps.json`、公開 URL、HTML / Canvas / DOM の前提
   - テスト: 利用者から見た挙動を検証しているか。実装詳細や文字列一致に依存していないか
   - ドキュメント: `README.md`、`AGENTS.md`、`apps.json`、`index.html` の更新が同じ変更に含まれるか
   - セキュリティ: 外部入力、`innerHTML`、URL、依存追加、GitHub Actions の権限
   - 回帰: 既存ゲームの操作、スコア、モバイル幅、パフォーマンス

4. 各指摘に `Blocker` / `Nit` / `Consider` / `FYI` のラベルを付ける。`Blocker` はマージ前に修正が必要な不具合、仕様違反、セキュリティ問題、データ破壊、主要機能の停止だけにする。推測だけの指摘は `Consider` 以下にする。

5. レビュー本文を作る。先頭に結論、対象 SHA、Blocker 数を書き、その後にファイルと行、失敗経路、修正案を続ける。指摘がなければ `LGTM` と検証範囲を書く。本文は `/tmp/pr-review-<n>.md` に write ツールで保存する。リポジトリ内のファイルは編集しない。

   ```text
   **Blocker: 1件**

   対象 SHA: <head>

   - Blocker: `path/to/file.js:42` — ...
   - Nit: ...
   ```

6. レビューを投稿する。本文に marker を自分で入れない。スクリプトが付与する。`--head` には手順1で固定した SHA を渡す。head が変わっていた場合はスクリプトが投稿を拒否するので、最新 head でレビューをやり直す。

   ```sh
   python3 tools/pr_review.py --pr <n> --head <head> \
     --body-file /tmp/pr-review-<n>.md \
     --blockers <Blocker数> --findings <全指摘数>
   ```

7. 投稿結果の `head`、`review_id`、`blockers`、`findings`、`review_url` を報告する。

## 判定

- `Blocker: 0件` のときだけ、マージゲートのレビュー条件を満たす。
- `Blocker` が残る場合は、修正後に同じ PR を再レビューする。最大3ラウンドを目安にする。
- レビュー本文は日本語で書く。コード識別子、コマンド、パスは原表記のままにする。
