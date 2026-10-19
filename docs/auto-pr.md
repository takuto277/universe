# PR の自動レビューと自動マージ

PR を Ready にするだけで、レビューとマージまで自動で進めるためのローカル常駐処理です。u7chan の常駐チームと同じ「レビュアーとマージ担当を分ける」考え方に、PR 作成の自動検知を足しています。

## 動き方

`tools/auto-pr.sh` を macOS の LaunchAgent から 60 秒ごとに実行します。

1. 自分が作成した open かつ非 Draft の PR を `main` 向けに探す
2. 最新 head のレビューがなければ `opencode run --command pr-review` で AI レビューを投稿する
3. Blocker が 0 で五点ゲートが通れば、`tools/pr_merge.py` で squash merge する
4. Blocker があれば通知して止める。自動修正はしない
5. CI 待ちや一時的な失敗は次回以降に再試行する

対象外:

- `ai-pause` ラベル付きの PR（五点ゲートでも停止します）
- `do-not-merge` ラベル付きの PR（五点ゲートでも停止します）
- Draft PR
- 他人が作成した PR
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

- PR を Draft に戻す（マージ直前の再確認で止まります。再確認の直後に戻した場合は、次回の周期で止まります）
- `ai-pause` ラベルまたは `do-not-merge` ラベルを付ける

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
- AI レビューは15分で打ち切ります（perl の alarm を使用）
- ロックが60分以上残った場合は次回に回収します。回収時は稼働中のプロセスを強制終了することがあります
- Blocker の自動修正はしません。修正して push するか、`/pr-deliver` を使ってください
- 五点ゲートはローカル手順なので、マージ権限を持つ人が迂回できます

## 環境変数

LaunchAgent の plist に反映されるもの:

- `UNIVERSE_AUTO_PR_MODEL`: AI レビューに使う opencode のモデル。既定は `opencode/deepseek-v4.1-flash-free`
- `UNIVERSE_AUTO_PR_REPO`: 対象リポジトリ。既定は `takuto277/universe`

手動実行時だけ有効なもの:

- `UNIVERSE_AUTO_PR_GATE_WAIT`: ゲートが checks を待つ秒数。既定は `90`
- `UNIVERSE_AUTO_PR_TIMEOUT`: AI レビューの上限秒数。既定は `900`
- `UNIVERSE_AUTO_PR_LOCK_STALE`: ロックを回収するまでの秒数。既定は `3600`
