# seed の確保

複数のセッションが同時にゲーム案（seed）を選ぶと、同じゲームを二重に作り始めることがあります。ゲームの実装ファイルは `projects/_labs/<id>/` に分かれていても、**どの seed を誰が作るか**は共有の判斷なので、選定そのものを排他する必要があります。

`tools/seed.sh` は、ゲームID単位のロックを `mkdir` で原子的に取り、同じリポジトリの全 worktree で共有します。

## 使い方

```sh
./tools/seed.sh list            # 種の一覧（implemented / claimed / available）
./tools/seed.sh list --available # 空きだけ
./tools/seed.sh next            # 次の空きを原子的に確保
./tools/seed.sh next --no-claim # 確保せずに次の空きを確認
./tools/seed.sh claim tutor     # 指定の種を確保
./tools/seed.sh status          # 誰が何を確保しているか
./tools/seed.sh release tutor   # 確保を解放
./tools/seed.sh clean           # 24時間より古い確保を掃除
```

`next` は `docs/game-seeds.md` のランキング表を読み、`apps.json` の実装済みIDとロック済みIDを除いた先頭の種を確保します。新案10を優先し、その次に30案を見ます。

## 確保の仕組み

- ロックは `git rev-parse --git-common-dir` 配下の `universe-seed-claims/<id>.lock/` に作ります。
- 作成は `mkdir` なので、同時に同じIDを確保しようとしても片方だけが成功します。
- worktree が違っても git common dir は同じなので、`universe` と `universe-*` のセッションで共有されます。
- ロックは `.git` の中なのでコミットされません。メタ情報（owner / branch / worktree / created）は `status` で確認できます。
- 別クローン同士で共有したい場合は `UNIVERSE_SEED_LOCK_DIR=/path/to/shared` を両方に設定してください。
- セッション名を明示したい場合は `UNIVERSE_SEED_OWNER=my-session` を設定してください（既定: `branch@host`）。

## 推奨フロー

1. 実装を始める前に `./tools/seed.sh next`（または `claim <id>`）で確保する。
2. 確保したIDで `projects/_labs/<id>/` を作り、`apps.json` と seed ドキュメントを更新する。
3. PR を作ったら `./tools/seed.sh release <id>` で解放する。
4. セッションが落ちて残った確保は `status` で確認し、必要なら `release --force` か `clean` で消す。

```sh
./tools/seed.sh next
# claimed #5 tutor  教えてロボ / TUTOR
# (実装)
./tools/seed.sh release tutor
```

## 注意

- ロックは「選定の重複」を防ぐための助言的な仕組みです。`docs/game-seeds.md` 自体の編集は従来どおり必要です。採用時の追記は、確保済みIDを見てから行ってください。
- `next` の候補は `docs/game-seeds.md` の表に依存します。表にない種を確保するときは `claim <id>` を使ってください。
- 実装済みのIDは `claim` できません。v2 として作業する場合は `claim <id> --force` を使います。
- 古い確保は `clean --hours N` で掃除できます。既定は24時間です。
