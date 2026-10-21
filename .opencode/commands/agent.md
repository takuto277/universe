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
4. 本文は一時ファイルに書いてから、`--body-file` で渡す(引用符・改行・`$()` での事故を防ぐ)

   ```sh
   cat > /tmp/agent-request.md <<'BODY'
   背景:
   提案:
   受け入れ条件:
   対象範囲:
   BODY
   ./tools/agent.sh enqueue "<タイトル>" --body-file /tmp/agent-request.md
   ```

5. 作成された Issue の URL と、`./tools/agent.sh status` の結果を短く報告する

実装・push・PR 作成はランナーに任せ、レビューとマージは五点ゲートに任せてください。自分では実装・マージをしないでください。
