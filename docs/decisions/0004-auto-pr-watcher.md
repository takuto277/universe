# 0004 PR のレビューとマージをローカル watcher で自動起動する

- Status: Accepted
- Date: 2026-10-20

## Context

ADR 0003 でレビューとマージを分離したが、PR ごとに `/pr-deliver` を実行する必要があり、日常の変更では手間が大きい。u7chan/agent-harness の常駐チームは依頼を受けて動く方式で、PR 作成を自動検知しない。個人開発では、PR を Ready にした時点で同じゲートを自動実行したい。

## Decision

- macOS の LaunchAgent から `tools/auto-pr.sh` を 60 秒ごとに実行する
- 自分が作成した open かつ非 Draft の `main` 向け PR だけを対象にする
- 最新 head のレビューがなければ `opencode run --auto --command pr-review` を実行する
- Blocker が 0 で五点ゲートが通った場合だけ `tools/pr_merge.py` で squash merge する
- Blocker がある場合は通知して停止し、自動修正はしない
- PR を Draft に戻すか `ai-pause` ラベルを付けると、その PR を対象外にできる
- 全体停止は `~/.local/state/universe-auto-pr/pause` で行う

## Consequences

良い面:

- PR を Ready にするだけでレビューとマージが進む
- u7chan と同じく、レビュアーとマージ担当、五点ゲートを維持できる
- 既存の `gh` と opencode の認証を使うため、追加の API キーが不要
- 失敗時は通知とログが残り、ゲートを迂回しない

制約:

- Mac がログイン状態で起動している必要がある。スリープ中は遅延する
- AI レビューの実行に opencode の認証が必要
- Blocker の自動修正はしない
- 非 Draft の PR は原則として自動対象になるため、作業中は Draft か `ai-pause` を使う

## Alternatives

- GitHub Actions で LLM を呼ぶ: Mac の起動に依存しないが、LLM の API キーを GitHub Secrets に置く必要がある
- 手動の `/pr-deliver`: 制御しやすいが、PR ごとの操作が残る
- GitHub の auto-merge だけを使う: AI レビューと五点ゲートがない
