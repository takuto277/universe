# 0007 builder と verify を sandbox-exec で隔離する

- Status: Accepted
- Date: 2026-10-22

## Context

ADR 0005 の builder は、権限 allowlist と保護パス検査で危険な操作を制限しているが、プロセス自体はユーザー権限で動く。モデルの誤操作や Issue 本文由来の指示で、worktree 外のファイルを読む・書く可能性が残る。専用 OS ユーザやコンテナは強いが、認証の再設定や追加インストールが必要になる。

## Decision

- `UNIVERSE_AGENT_SANDBOX=seatbelt` のとき、builder と `verify.sh` を macOS の `sandbox-exec` で包む
- deny-by-default とし、書き込みは「その実行の worktree」「実行ごとの一時ディレクトリ」「`/dev`」「opencode のデータ/キャッシュ」だけを許可する。リポジトリの `.git`、state dir、`~/.config/opencode` は書き込み禁止とする
- builder は編集だけを行い、コミットは sandbox の外で runner が行う（`.git/hooks` や `config` を書かせない）
- 読み取りは既定で許可しつつ、`~/.ssh`、`~/.aws`、`~/.config/gh`、`~/Library/Keychains`、`~/Documents` など一般的な秘密・個人領域を拒否する
- ネットワークはモデル API のために許可する
- 既定は `none`。インストーラで `UNIVERSE_AGENT_SANDBOX=seatbelt` を指定したときだけ有効にする

## Consequences

良い面:

- 追加のインストールやユーザー作成なしで、worktree 外への書き込みと代表的な秘密ファイルの読み取りを防げる
- builder だけでなく、PR 由来のテストを実行する verify も同じ制限で動く
- 失敗時は sandbox-exec のエラーとしてログに残り、原因を追いやすい

制約:

- `sandbox-exec` は非推奨であり、将来の macOS で使えなくなる可能性がある
- ネットワークは許可しているため、読み取れた情報の外部送信は防げない
- keychain や ssh-agent は `mach-lookup` 経由で利用でき、秘密情報の完全な遮断ではない
- 許可していないパスの読み取りは防げない（既知の秘密ディレクトリのみ拒否）
- 専用ユーザやコンテナほどの強さはない。必要になったら段階的に強化する

## Alternatives

- 専用 macOS ユーザで実行する: 強いが、gh/opencode の認証を別途用意する必要がある
- コンテナで実行する: 強いが、Docker/Podman の導入とイメージ管理が必要
- 何もしない: 実装コストはゼロだが、worktree 外への影響を許容することになる
