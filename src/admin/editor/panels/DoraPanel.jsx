import { getTileImageUrl, getDoraIndicator } from '../../../utils/tileUtils'

// ドラパネル（ドラタブ・盤面の王牌クリックから開く）。
// 値の差し替えは下の牌パレットで行うので、ここは現在の値の確認だけ。
// ★ 盤面の王牌に出るのは**ドラ表示牌**（1つ前の牌）なので、取り違えないよう両方並べる
export default function DoraPanel({ dora }) {
  return (
    <div className="palette-tab-content">
      <div className="editor-section-label">いまのドラ</div>
      <div className="editor-dora-row">
        <span className="editor-current">ドラ</span>
        {/* 押しても何も起きない見本なので button（TileImg）ではなく span で描く */}
        <span className="tile-btn editor-tile editor-tile--static">
          <img src={getTileImageUrl(dora)} alt={dora} width={30} height={41} />
        </span>
        <span className="editor-current">王牌に出る表示牌</span>
        <span className="tile-btn editor-tile editor-tile--static">
          <img src={getTileImageUrl(getDoraIndicator(dora))} alt={getDoraIndicator(dora)} width={30} height={41} />
        </span>
      </div>
      <p className="editor-current">下の牌パレットをクリックするとドラが差し替わります。</p>
    </div>
  )
}
