---
description: Review a pull request with the independent AI reviewer.
agent: pr-reviewer
subtask: true
---

PR $ARGUMENTS をレビューしてください。

`pr-review` skill に従い、最新 head の差分、関連ファイル、テスト、ドキュメント、CI を確認し、Blocker / Nit / Consider / FYI に分類してください。結果は `python3 tools/pr_review.py --pr <番号> --body-file <ファイル> --blockers <件数> --findings <件数>` で COMMENT レビューとして投稿してください。承認・マージ・編集はしないでください。
