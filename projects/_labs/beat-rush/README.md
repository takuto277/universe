# BEAT RUSH

4レーンに落ちてくるノートを、ラインに合わせて叩く30秒リズムゲームです。

## 遊び方

- 4レーンに流れてくるノートをタップ、または **D / F / J / K** キーで叩く
- 判定は PERFECT / GOOD / OK / MISS
- コンボをつなぐほどスコアが伸びる
- 30秒終了時の精度で S / A / B / C / D ランク

## 見どころ

- 4色のネオンレーンと、ビートに合わせた発光
- 3-2-1カウントイン、コンボ表示、ノートの軌跡、レーンビーム
- キック・ハット・ベース・アルペジオのWebAudioループとミュート
- ノートの落下、ヒット時のパーティクルと判定表示
- WebAudioで鳴るキック・ハット・ヒット音
- EARLY / LATE、FULL COMBO、ベストスコア記録
- 30秒・4レーン・スマホ縦画面向け

## 構成

| ファイル | 役割 |
| --- | --- |
| `engine.js` | 譜面生成、判定、スコア、コンボ、終了処理 |
| `game.js` | Canvas描画、入力、HUD、画面遷移 |
| `audio.js` | WebAudioのビート・ヒット音 |
| `index.html` | 画面の骨格、ルール、リザルト |
| `style.css` | HUD、レーン、開始/終了画面 |
| `test-engine.js` | 判定、スコア、MISS、終了条件 |
| `test-smoke.js` | 自動プレイで30秒完走 |

## テスト

universe のルートで:

```sh
./tools/run-tests.sh
```

個別:

```sh
cd projects/_labs/beat-rush
jsc test-engine.js
jsc test-smoke.js
```

## 設計メモ

- BPM 128、1小節4拍、30秒の固定譜面
- ノートは時間ベースで管理し、描画時に落下位置を計算
- 判定幅は PERFECT 55ms / GOOD 110ms / OK 180ms
- CHART_START=2.4秒で3-2-1カウントイン
- スコアはPERFECT/GOOD/OKとコンボで加算。終了時にEARLY/LATEとFULL COMBOを表示
- 画像素材は未導入。ネオンとノートはCanvasで描画
