# 0012: ミニゴルフ3D化にThree.jsをvendored

## 背景
`night-mini-golf` を、ボール後方の3Dチェイスカメラで遊ぶCPU対戦ミニゴルフへ拡張する。

## 決定
Three.js 0.160.0のminified buildを `projects/_labs/night-mini-golf/vendor/three.min.js` にvendoredし、実行時に外部CDNへ依存しない。MITライセンスを同梱する。

## 理由
- 3Dカメラ・メッシュ・ライティングを独自実装するより、コース体験とCPU対戦に時間を割ける
- GitHub Pagesの静的配信を維持し、実行時ネットワーク依存を増やさない
- 既存の2D物理をXZ平面に写すことで、ゲームロジックを過度に複雑化しない

## 影響
- アプリ容量が約650KB増える
- WebGL非対応環境では3D描画が無効になる
- コースはThree.jsのbox/cylinder/sphereで構築し、外部3Dアセットは使わない
