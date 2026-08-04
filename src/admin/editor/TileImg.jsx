import { getTileImageUrl, getTileLabel } from '../../utils/tileUtils'
import { useTap } from '../../utils/useTap'

// 管理画面・作問画面の牌ボタン（パレット／正解設定／副露入力／捨て牌で共用）。
// 出題画面の TileButton とは別実装だが、タップの扱いは同じ useTap に載せてある
export default function TileImg({ tile, size = 44, onClick, className = '' }) {
  const url = getTileImageUrl(tile)
  // 隣り合う小さい牌の連続タップでクリックが隣へ誤配送されるのを防ぐ（出題画面の TileButton と同じ）
  const tap = useTap(onClick ?? (() => {}), { disabled: !onClick })
  return (
    <button className={`tile-btn ${className}`} {...tap} title={getTileLabel(tile)}>
      {url
        ? <img src={url} width={size} height={Math.round(size * 60 / 44)} alt={tile} />
        : <span className="tile-code">{tile}</span>
      }
    </button>
  )
}
