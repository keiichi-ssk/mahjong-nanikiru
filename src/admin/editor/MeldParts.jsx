import { getTileImageUrl } from '../../utils/tileUtils'
import {
  MELD_TYPES, MELD_TYPE_LABELS, MELD_TILE_COUNT, getMeldTileRole, getMeldFromOptions,
} from '../../utils/problemConstants'
import TileImg from './TileImg'

// 横向きにする牌の位置は getMeldTileRole が唯一の実装（出題画面・盤面・OGPカードと共通）
export function MeldPreview({ meld }) {
  const { type, tiles, from } = meld
  return (
    <div className="meld-preview">
      {tiles.map((t, i) => {
        const role = getMeldTileRole(type, i, from)
        if (role === 'back') return <div key={i} className="meld-preview-back" />
        return (
          <div key={i} className={`meld-preview-tile${role === 'rotated' ? ' meld-preview-tile--rotated tile-rotated' : ''}`}>
            <img src={getTileImageUrl(t)} alt={t} width={30} height={Math.round(30 * 60 / 44)} />
          </div>
        )
      })}
    </div>
  )
}

// 副露の「鳴いた元」セレクタ。
// 暗槓（選択肢なし）は何も描画せず、チー（上家のみ）はセレクタではなく固定表示にする
export function MeldFromSelect({ type, value, onChange }) {
  const options = getMeldFromOptions(type)
  // 選べる鳴いた元が無い（暗槓）／1つしかない（チー＝上家から固定）ときは何も出さない。
  // 選択肢が無いものを表示しても場所を取るだけなので、値の補完は normalizeMeld に任せる
  if (options.length <= 1) return null
  return (
    <select
      className="meld-from-select"
      value={options.includes(value) ? value : options[0]}
      onChange={e => onChange(e.target.value)}
      title="鳴いた元"
      onClick={e => e.stopPropagation()}
    >
      {options.map(f => <option key={f} value={f}>{f}から</option>)}
    </select>
  )
}

// 副露の種類のサブタブ（手牌・他家捨て牌の家ブロックで共用）。
// 押すとその種類で入力を開始する＝選択中の牌はクリアされる（newAddingMeld を作り直すため）
export function MeldTypeTabs({ active, onSelect }) {
  return (
    <div className="meld-type-tabs">
      {MELD_TYPES.map(type => (
        <button
          key={type}
          className={`meld-type-tab${active === type ? ' meld-type-tab--active' : ''}`}
          onClick={() => onSelect(type)}
        >
          {MELD_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  )
}

// 副露入力中パネル（手牌・他家捨て牌の家ブロックで共用）。牌は下のパレットから追加し、揃うと自動確定する
export function MeldAddingPanel({ meld, onCancel, cancelLabel = 'キャンセル', onRemoveTile, onChangeFrom }) {
  return (
    <div className="meld-adding">
      <div className="meld-adding-header">
        <span className="meld-adding-title">
          {MELD_TYPE_LABELS[meld.type]}：下のパレットから牌を選択（揃うと自動で追加）
          （{meld.tiles.length} / {MELD_TILE_COUNT[meld.type]}枚）
        </span>
        <MeldFromSelect type={meld.type} value={meld.from} onChange={onChangeFrom} />
        <button className="meld-cancel-btn" onClick={onCancel}>{cancelLabel}</button>
      </div>
      <div className="meld-selected-tiles">
        {meld.tiles.map((t, i) => (
          <TileImg key={i} tile={t} size={36} onClick={() => onRemoveTile(i)} className="editor-tile" />
        ))}
        {Array.from({ length: MELD_TILE_COUNT[meld.type] - meld.tiles.length }).map((_, i) => (
          <div key={`empty-${i}`} className="meld-tile-slot" />
        ))}
      </div>
    </div>
  )
}
