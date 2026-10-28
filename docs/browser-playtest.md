# ブラウザ自動プレイ

`tools/playtest/playtest.py` は Playwright で実際のChromiumを起動し、各ゲームを自動操作して、描画・状態変化・コンソールエラーを確認します。

## 何を見るか

- ページがHTTP 200で開く
- `window.__GAME__` と `getState()` がある
- canvasが描画されている
- 開始操作後、キー入力や `autoPlayStep` で状態が変わる
- page error / console error が出ていない
- スクリーンショットを保存する

## ローカル

```sh
python3 -m pip install -r tools/playtest/requirements.txt
python3 -m playwright install chromium

python3 tools/playtest/serve.py --directory . --port 8000 &
python3 tools/playtest/playtest.py --base-url http://127.0.0.1:8000 --all
```

特定アプリだけ:

```sh
python3 tools/playtest/playtest.py \
  --base-url http://127.0.0.1:8000 \
  --app gravity-flip --seconds 6
```

## CI

- `Browser playtest` はゲーム変更のPRで、ローカル配信に対して全アプリを自動プレイ
- 実験プレビューの `Experiment preview` は、デプロイ後にプレビューURLへ同じ自動プレイを実行
- スクリーンショットはActionsのartifactに保存

## 費用

publicリポジトリの標準GitHub Actionsランナー、Playwright、Chromiumは追加費用なしで使えます。
外部の有料AI APIは呼びません。ローカル実行時も無料で、CPUと通信だけを使います。

## 限界

- これは「決まった自動操作 + 描画/エラー検査」であり、面白さを判断するAIではありません
- ゲーム固有の操作はキー入力と `autoPlayStep` に依存します
- 見た目の最終判断はプレビューを人間が触るか、スクリーンショットをAIレビューに渡して行います
