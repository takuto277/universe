---
description: Review a pull request, fix blockers, re-review, then merge it.
agent: build
---

PR $ARGUMENTS を「レビュー → 修正 → 再レビュー → マージ」の順で完遂してください。あなたはオーケストレーターであり、レビューとマージは必ず別の subagent に任せます。

1. `task` ツールで `subagent_type` を `pr-reviewer` にして PR をレビューさせる。
2. Blocker があれば、あなたが実装を修正し、`./tools/verify.sh` を通して commit / push する。修正後は再度 `pr-reviewer` にレビューさせる。これを最大3ラウンド繰り返す。
3. 最新 head のレビューで Blocker が 0 になったら、`task` ツールで `subagent_type` を `pr-merger` にしてマージさせる。
4. レビューとマージを自分で代行しない。`gh pr merge` を直接実行しない。ゲートが失敗したら迂回せず、理由を報告する。

最終報告には、各ラウンドの review ID、Blocker 数、修正 commit、最終 head SHA、merge commit を含めてください。
