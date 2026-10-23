# スキル

`.opencode/skills/` のスキルは、エージェントに手順と制約を渡すための小さなパッケージです。リポジトリ内でバージョン管理し、契約テストで壊れていないことを確認します。

## 一覧とバージョン

`.opencode/skills/registry.json` が正です。

| スキル | 版 | 用途 |
| --- | --- | --- |
| `pr-review` | 1 | PR の独立レビュー（COMMENT + marker） |
| `pr-merge` | 1 | 五点ゲートを通した squash merge |
| `unattended-ops` | 1 | 無人実装キューの操作・障害時の確認 |

## 契約

`python3 tools/check_skills.py` が次を検査します。

- `registry.json` の `name` / `version` / `path` が正しい
- 各 `SKILL.md` に frontmatter の `name` と `description` がある
- `registry` の `name` と frontmatter の `name` が一致する
- 未登録のスキルディレクトリがない
- ホームディレクトリの絶対パス（`/Users/...`、`/home/...`）を含まない
- 相対リンクの先が存在する

検査自体のテストは `python3 tools/test_skills.py` です。

## 配布

他のリポジトリや個人設定で使う場合は、スキルディレクトリをコピーまたはシンボリックリンクします。

```sh
mkdir -p ~/.config/opencode/skills
ln -s "$PWD/.opencode/skills/pr-review" ~/.config/opencode/skills/pr-review
```

- スキルはこのリポジトリの `tools/` や運用を参照するため、そのまま他リポジトリで動くとは限りません
- 変更したら `registry.json` の `version` を上げ、`./tools/verify.sh` を通してください
- 秘密情報や環境固有の絶対パスを含めないでください

## 変更の流れ

1. スキルを追加・変更する
2. `registry.json` を更新する（追加・版上げ）
3. `python3 tools/check_skills.py` と `./tools/verify.sh` を通す
4. PR を出す（スキルは無人 builder の保護対象外ですが、内容はレビューで確認します）
