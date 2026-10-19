# テスト

universe のテストは、外部依存を増やさず JavaScriptCore の `jsc` で実行します。

## 実行方法

テスト、サイト検査、PR スクリプトの構文・待機判定テストをまとめて実行します。

```sh
./tools/verify.sh
```

テストだけを実行する場合:

```sh
./tools/run-tests.sh
```

`jsc` が PATH にない場合は、macOS 標準の次の場所を自動で使います。

```text
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
```

別のバイナリを使う場合は `JSC` 環境変数で指定できます。

```sh
JSC=/path/to/jsc ./tools/run-tests.sh
```

## テストの種類

### engine テスト

`test-engine.js` は、描画に依存しないロジックを検証します。

- 状態遷移、スコア、カウント、乱数分岐などの仕様
- 境界値と異常系
- 大量試行によるバランスの確認（必要に応じて）

乱数はテスト側から固定できるようにし、実行するたびに結果が変わらないようにします。

### スモークテスト

`test-smoke.js` は `tools/harness.js` を使い、DOM や Canvas をスタブ化して1プレイを最後まで自動実行します。

- ゲームが制限ステップ内に終了する
- 終了状態とスコアが矛盾しない
- 画面が終了状態へ遷移する
- `console.error` が発生しない

## テストを書くときの原則

- 利用者から見た挙動を検証する
- 実装の詳細やソース文字列の一致に依存しすぎない
- テストのためにプロダクションコードへ過剰なフックを追加しない
- 見た目の微調整は自動テストではなく手動確認にする
- 失敗したとき、どの仕様が壊れたか分かるメッセージにする

## CI とマージゲート

GitHub Actions の `CI` ワークフローが、push と pull request で `tests` と `site` を実行します。main は branch protection で保護されているため、この2つが通るまで PR はマージできません。

マージは `python3 tools/pr_merge.py --pr <n>` の五点ゲートを通した後に行います。ゲートは CI に加えて、最新 head の AI レビュー（Blocker 0）、未解決 review thread 0、必要に応じた UI 証跡を確認します。詳細は [PR 運用](pr-workflow.md) を参照してください。
