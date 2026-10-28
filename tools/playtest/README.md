# browser playtest

Playwright で公開ページを実際のChromiumで開き、ゲームを自動操作して
コンソールエラー・描画・状態変化を確認します。

```sh
python3 -m pip install -r tools/playtest/requirements.txt
python3 -m playwright install chromium

# ローカル
python3 tools/playtest/serve.py --directory . --port 8000 &
python3 tools/playtest/playtest.py --base-url http://127.0.0.1:8000 --all

# 実験プレビュー
python3 tools/playtest/playtest.py \
  --base-url https://takuto277.github.io/universe-preview/experiments/issue-170/ \
  --app janken-game --seconds 6
```

スクリーンショットは `--screenshots` で指定したディレクトリへ保存します。
GitHub Actions では public リポジトリの標準ランナーとPlaywright/Chromiumを使うため、
追加の有料APIは不要です。
