---
name: unattended-ops
description: Use when operating the unattended implementation queue, explaining proposal/fix/findings flow, or troubleshooting the automation checkouts, labels, sandbox, and LaunchAgents.
---

# Unattended Ops

無人実装ランナーと watcher を安全に運用するための手順です。

## 最初に見るもの

```sh
./tools/agent.sh status
./tools/automation-root.sh status
tail -n 50 ~/Library/Logs/universe-agent-runner.log
tail -n 50 ~/Library/Logs/universe-auto-pr.log
```

## 依頼を流す

```sh
./tools/agent.sh enqueue "アプリ名: 要約" --body-file /tmp/request.md
./tools/agent.sh promote <issue番号>
```

`agent:ready` が実装キュー、`agent:proposed` は提案・レビュー指摘です。`agent:running` が残っている場合は、原因を確認して `promote` で戻します。

## 止める

```sh
./tools/agent.sh pause      # 実装キュー
./tools/agent.sh resume
```

watcher 全体は `~/.local/state/universe-auto-pr/pause`、PR 単位は Draft / `ai-pause` / `do-not-merge` で止めます。

## レビューと修正

- Blocker は watcher が `fix --pr` で自動修正を試み、最大3回で停止します
- レビューの Consider/Nit は `findings --pr` で `agent:proposed` に記録されます
- 週次 planner は毎週月曜09:00 に提案を作ります

## 制約

- `tools/` と `.github/workflows/` は保護対象で、無人 builder からは変更できません
- builder は編集のみ、コミットは runner が行います
- sandbox は完全ではありません（ネットワーク・keychain など）。信頼できる Issue だけをキューに入れてください
- LaunchAgent は専用チェックアウト（既定 `~/.local/share/universe-automation`）から動き、起動時に main へ更新されます
- 元の作業チェックアウトを移動・削除すると専用チェックアウトも壊れます
