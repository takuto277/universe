# 0011: 3D校舎レースにThree.jsをvendored

## 背景
`school-chair-drift` を、後方チェイスカメラの本格3D校舎レースへ拡張する。廊下・教室・体育館を3Dジオメトリで構築し、4人レースとアイテムを維持する。

## 決定
Three.js 0.160.0 のminified buildを `projects/_labs/school-chair-drift/vendor/three.min.js` にvendoredし、実行時に外部CDNへ依存しない。Three.jsはMITライセンスで、ライブラリ本体にライセンス表記を保持する。

## 理由
- 3D行列・ライティング・メッシュ・WebGLコンテキスト管理を自前実装するより、校舎の形状とレース体験に時間を割ける
- 実行時にネットワーク依存を増やさず、GitHub Pagesの静的配信のまま動かせる
- 既存の依存ゼロ方針からの例外はこのアプリ内に限定し、他アプリには影響させない

## 影響
- アプリのリポジトリサイズが約650KB増える
- WebGL非対応環境では3D描画が無効になる
- 3DモデルはThree.jsのbox/cylinder/sphereで構築し、外部3Dアセットは使わない
