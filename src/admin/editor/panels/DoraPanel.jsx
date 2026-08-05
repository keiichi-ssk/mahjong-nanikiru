import { getTileImageUrl, getTileLabel } from '../../../utils/tileUtils'

// ドラパネル（ドラ表示牌タブ・盤面の王牌クリックから開く）。
// 値の差し替えは下の牌パレットで行うので、ここは現在の値の確認だけ。
// ★ パレットで選ぶのは**ドラ表示牌**（王牌に出る牌）。ここに出すのは変換後のドラ
export default function DoraPanel({ dora }) {
  return (
    <div className="palette-tab-content">
      <div className="editor-section-label">いまのドラ</div>
      <div className="editor-dora-row">
        {dora ? (
          <>
            {/* 押しても何も起きない見本なので button（TileImg）ではなく span で描く */}
            <span className="tile-btn editor-tile editor-tile--static">
              <img src={getTileImageUrl(dora)} alt={dora} width={30} height={41} />
            </span>
            <span className="editor-current">{getTileLabel(dora)}</span>
          </>
        ) : (
          <span className="editor-current">なし</span>
        )}
      </div>
    </div>
  )
}
