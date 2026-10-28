# thumbnails

ゲーム一覧用のサムネイルを、実際のゲームプレイ画面から生成します。

```sh
python3 -m pip install -r tools/playtest/requirements.txt
python3 -m playwright install chromium

python3 tools/playtest/serve.py --directory . --port 8000 &
python3 tools/thumbnails/generate.py --base-url http://127.0.0.1:8000
```

`projects/<...>/thumb.jpg` を 1200×800 で生成します。画像変換にmacOSの`sips`を使います。特定のゲームだけ:

```sh
python3 tools/thumbnails/generate.py --base-url http://127.0.0.1:8000 --app neon-stack
```

`apps.json` の `thumbnail` と `tags` も更新してください。
