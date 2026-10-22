# Security Policy

## 対象

このリポジトリの静的アプリと開発ツール（`tools/`、`.opencode/`、GitHub Actions）を対象とします。

## 脆弱性の報告

脆弱性は公開Issueに書かず、GitHub の Security Advisories から非公開で報告してください。

https://github.com/takuto277/universe/security/advisories/new

次の情報があると助かります。

- 影響するアプリ・ファイル
- 再現手順
- 想定される影響（情報漏えい、任意コード実行など）
- 可能なら修正案

個人開発のため対応時間は保証できませんが、内容を確認して7日以内の一次回答を目指します。

## 運用上の注意

- 秘密情報（トークン、鍵、個人情報）をコミットしないでください。GitHub Actions は最小権限の `permissions` を使います
- 無人エージェントは `sandbox-exec` で書き込み先と読み取りを制限できます（`docs/unattended-agents.md`）。ただし完全なサンドボックスではありません
- Dependabot と CodeQL を有効にし、依存とコードの変化を確認します
