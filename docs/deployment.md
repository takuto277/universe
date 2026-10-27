# 公開

universe は GitHub Pages で静的サイトとして公開します。

## 公開元

- ブランチ: `main`
- ディレクトリ: リポジトリ直下
- 入口: `index.html`

`.nojekyll` を置いているため、Jekyll の処理を挟まずにファイルがそのまま配信されます。

## URL

各アプリはディレクトリ単位で公開されます。

```text
https://takuto277.github.io/universe/
https://takuto277.github.io/universe/projects/_labs/baseball-game/
https://takuto277.github.io/universe/projects/_samples/janken-game/
https://takuto277.github.io/universe/projects/_labs/gravity-flip/
https://takuto277.github.io/universe/projects/_labs/unknown-word-deal/
https://takuto277.github.io/universe/projects/_labs/observer-game/
https://takuto277.github.io/universe/graph-cross/
https://takuto277.github.io/universe/exponential-balls/
```

アプリのディレクトリ名は公開 URL の一部です。名前を変えるとブックマークや外部リンクが壊れるため、旧パスにはリダイレクトを置いています。

```text
/universe/baseball-game/     -> /universe/projects/_labs/baseball-game/
/universe/janken-game/       -> /universe/projects/_samples/janken-game/
/universe/gravity-flip/      -> /universe/projects/_labs/gravity-flip/
/universe/unknown-word-deal/ -> /universe/projects/_labs/unknown-word-deal/
/universe/observer-game/     -> /universe/projects/_labs/observer-game/
```

## ローカル確認

```sh
python3 -m http.server 8000
```

http://localhost:8000/ で本番と同じディレクトリ構成を確認できます。

## 公開前チェック

```sh
./tools/run-tests.sh
python3 tools/check_site.py
```

`check_site.py` は次を検査します。

- `apps.json` とアプリディレクトリの一致
- `index.html` のカードと `apps.json` の一致
- ローカルリンク・アセットの存在
- 各アプリの `README.md` とテストの有無

## キャッシュ

CSS や JS を更新しても古いファイルが残る場合は、ファイル名にバージョンを付けるか、参照側のクエリ文字列を更新します。現在は小規模なため、必要なときに導入します。
