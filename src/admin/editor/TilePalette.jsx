import { TILE_GROUPS } from './constants'
import TileImg from './TileImg'

// 牌パレット（萬子/筒子/索子/字牌の4行）。tileClassName は牌ごとにクラスを変えたいとき関数で渡す
export default function TilePalette({ size = 36, onTileClick, tileClassName }) {
  return TILE_GROUPS.map(group => (
    <div key={group.label} className="palette-row">
      <span className="palette-label">{group.label}</span>
      <div className="palette-tiles">
        {group.tiles.map(t => (
          <TileImg
            key={t} tile={t} size={size}
            onClick={() => onTileClick(t)}
            className={tileClassName ? tileClassName(t) : 'palette-tile'}
          />
        ))}
      </div>
    </div>
  ))
}
