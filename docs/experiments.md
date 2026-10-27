# 実験の運用

universe では、思いつきの機能をいきなり `main` へ入れず、**隔離ブランチ + プレビュー + 人間のジャッジ**で試します。

## 流れ

1. **提案**: 実験Issueを作る（テンプレートは `experiment:proposed`）
   - planner はゲームの新しい遊びの実験案を `experiment:proposed` で提案できます
2. **実装**: 人間が `experiment:ready` を付けたら、次を実行

   ```sh
   ./tools/experiment.sh <Issue番号>
   ```

   `experiment/issue-<番号>` ブランチでAIが実装し、テスト後にPRを作ります。
3. **プレビュー**: `experiment/**` ブランチのpushでGitHub Actionsが自動デプロイ
   - URL: `https://takuto277.github.io/universe-preview/experiments/<slug>/`
   - PRにURLがコメントされます
   - 実験PRには自動で `experiment:preview` と `do-not-merge` が付き、watcherはマージしません
4. **ジャッジ**: スマホなどで実際に触り、PRへラベルを付ける
   - `experiment:keep`: 採用。`do-not-merge` が外れ、通常のAIレビュー/五点ゲートへ進む
   - `experiment:discard`: 破棄。PRを閉じ、ブランチとプレビューを削除
5. **後片付け**: ブランチ削除時にプレビューも自動削除

## ラベル

| ラベル | 意味 |
| --- | --- |
| `experiment:proposed` | 実験の提案。まだ実装しない |
| `experiment:ready` | 実装する実験 |
| `experiment:preview` | プレビュー確認待ち。自動マージ対象外 |
| `experiment:keep` | 採用する |
| `experiment:discard` | 破棄する |

## 注意

- プレビューは公開URLです。秘密情報や個人情報を置かないでください
- プレビューには `robots.txt` で検索除外を入れています
- 実験中も `./tools/verify.sh` は通してください
- 実験は小さく、戻せる単位にしてください
- 迷ったら破棄を選び、学びだけをIssueに残します

## 現在の制限

- 実験の実装は `tools/experiment.sh` の手動起動です（常駐ランナーは今後）
- 提案の自動化はplannerの通常実行に含まれます
- 同時実験数の上限や予算制限はまだありません
