# PR の自動レビューと自動マージ

PR を Ready にするだけで、レビューとマージまで自動で進めるためのローカル常駐処理です。u7chan の常駐チームと同じ「レビュアーとマージ担当を分ける」考え方に、PR 作成の自動検知を足しています。

## 動き方

`tools/auto-pr.sh` を macOS の LaunchAgent から 60 秒ごとに実行します。

1. 自分が作成した open かつ非 Draft の PR を `main` 向けに探す
2. 最新 head のレビューがなければ `opencode run --command pr-review` で AI レビューを投稿する
3. Blocker が 0 で五点ゲートが通れば、`tools/pr_merge.py` で squash merge する
4. Blocker があれば `tools/agent_runner.py fix` で自動修正を試み、同じ PR に push して再レビューする。上限に達したら通知して止める
5. CI 待ちや一時的な失敗は次回以降に再試行する

対象外:

- `ai-pause` ラベル付きの PR（五点ゲートでも停止します）
- `do-not-merge` ラベル付きの PR（五点ゲートでも停止します）
- Draft PR
- 他人が作成した PR（Dependabot の PR も含みます。必要な場合は `/pr-deliver` でレビュー・マージしてください）
- `main` 以外を base にする PR

## セットアップ

初回だけ実行します。

```sh
./tools/install-auto-pr.sh
```

状態確認と停止:

```sh
./tools/install-auto-pr.sh --status
./tools/install-auto-pr.sh --uninstall
```

## 止め方

全体を一時停止する:

```sh
touch ~/.local/state/universe-auto-pr/pause
rm ~/.local/state/universe-auto-pr/pause
```

PR 単位で止める:

- PR を Draft に戻す（マージ直前の再確認で止まります。再確認を通過した後の Draft 化は、現在のマージを止められません）
- `ai-pause` ラベルまたは `do-not-merge` ラベルを付ける

## レビュー指摘の Issue 化

AI レビューを投稿したあと、Consider / Nit を `agent:proposed` の Issue として記録します（既定で有効）。

- 同じ指摘は本文の `review-finding fp=<hash>` で重複作成しません
- 1回の上限は `UNIVERSE_AGENT_FINDINGS_MAX`（既定5）
- `UNIVERSE_AUTO_PR_CREATE_ISSUES=0` で無効化できます（plist に反映するには再インストール）
- 提案は自動実装されません。`./tools/agent.sh promote <n>` で実装キューに移します

週次で新しい提案を作るには `./tools/install-agent-planner.sh` を使います。

## Blocker の自動修正

Blocker が出た PR は、`builder` がレビュー指摘を読んで修正し、同じ head ブランチへ push します。以後は通常どおり再レビューされ、Blocker 0 になれば五点ゲートでマージされます（自動修正がマージすることはありません）。

- 1 PR あたり最大 `UNIVERSE_AGENT_FIX_MAX`（既定3）回。上限後は通知して停止します
- 失敗した head は60分クールダウンし、同じ失敗を繰り返しません
- `tools/` と `.github/workflows/` を変更する必要がある指摘は自動修正できません（保護対象）。通知して人の対応に回します
- `UNIVERSE_AUTO_PR_AUTOFIX=0` で無効化できます（LaunchAgent の plist に反映するには再インストール）
- 自動修正の builder と verify も、agent runner の `UNIVERSE_AGENT_SANDBOX` 設定に従います
- pause / Draft / `ai-pause` / `do-not-merge` は従来どおり尊重します
- 実行履歴と通知は `tools/agent_runner.py` 側に残ります

## ログ

```sh
tail -f ~/Library/Logs/universe-auto-pr.log
```

手動で1回だけ動かす:

```sh
./tools/auto-pr.sh --verbose
./tools/auto-pr.sh --dry-run
```

`--dry-run` はレビュー投稿もマージもせず、対象と判定だけを表示します。

## 前提と制約

- macOS のログイン中だけ動きます。スリープ中は動かず、起床後に再開します
- `gh` と `opencode` の認証が必要です
- AI レビューは `opencode run --auto` で実行します。既定モデルは `opencode/deepseek-v4.1-flash-free` です
- `tests` / `site` の完了を最大90秒待ってからゲートを判定します
- AI レビューは30分で打ち切ります（perl の alarm を使用）
- ロックが120分以上残った場合は次回に回収します。回収時は稼働中のプロセスを強制終了することがあります
- Blocker は自動修正を試みます（上限・保護パス・失敗時は人へ）。詳しくは「Blocker の自動修正」を参照してください
- 五点ゲートはローカル手順なので、マージ権限を持つ人が迂回できます

## 環境変数

LaunchAgent の plist に反映されるもの:

- `UNIVERSE_AUTO_PR_MODEL`: AI レビューに使う opencode のモデル。既定は `opencode/deepseek-v4.1-flash-free`
- `UNIVERSE_AUTO_PR_REPO`: 対象リポジトリ。既定は `takuto277/universe`
- `UNIVERSE_AUTO_PR_BASE`: 対象 base branch。既定は `main`
- `UNIVERSE_AUTO_PR_AUTOFIX`: Blocker の自動修正。既定は `1`（`0` で無効）
- `UNIVERSE_AGENT_SANDBOX`: 自動修正の builder/verify の隔離。既定は `none`（`seatbelt` で有効）
- `UNIVERSE_AUTO_PR_CREATE_ISSUES`: レビュー指摘の Issue 化。既定は `1`（`0` で無効）
- `UNIVERSE_AGENT_FINDINGS_MAX`: 1回に Issue 化する指摘の上限。既定は `5`

手動実行時だけ有効なもの:

- `UNIVERSE_AUTO_PR_GATE_WAIT`: ゲートが checks を待つ秒数。既定は `90`
- `UNIVERSE_AUTO_PR_TIMEOUT`: AI レビューの上限秒数。既定は `1800`
- `UNIVERSE_AUTO_PR_LOCK_STALE`: ロックを回収するまでの秒数。既定は `7200`
