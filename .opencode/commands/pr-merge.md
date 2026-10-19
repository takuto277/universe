---
description: Run the merge gate and squash-merge a pull request.
agent: pr-merger
subtask: true
---

PR $ARGUMENTS をマージしてください。

`pr-merge` skill に従い、`python3 tools/pr_merge.py --pr <番号>` を実行してください。ゲートが失敗した場合はマージせず、観測値を報告して停止してください。
