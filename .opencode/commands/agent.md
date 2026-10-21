---
description: Enqueue a request as an unattended implementation issue.
agent: build
---

次の依頼を、無人実装ランナーのキューに追加してください。

依頼: $ARGUMENTS

手順:
1. 依頼が曖昧で、対象アプリや受け入れ条件が決められない場合は、1つだけ質問して確認する
2. タイトルを「<アプリ名または repo>: <日本語の要約>」にする
3. 本文に「背景 / 提案 / 受け入れ条件 / 対象範囲」を短くまとめる
4. 次のコマンドで Issue を作成する(本文はシェルで安全に渡す)

   ```sh
   ./tools/agent.sh enqueue "<タイトル>" --body "<本文>"
   ```

5. 作成された Issue の URL と、`./tools/agent.sh status` の結果を短く報告する

実装・push・PR 作成・マージはランナーに任せ、自分では行わないでください。
