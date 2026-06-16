import { useState } from 'react'
import { getTileImageUrl, getTileLabel } from '../utils/tileUtils'

const TILE_GROUPS = [
  { label: '萬子', tiles: ['1m','2m','3m','4m','5m','0m','6m','7m','8m','9m'] },
  { label: '筒子', tiles: ['1p','2p','3p','4p','5p','0p','6p','7p','8p','9p'] },
  { label: '索子', tiles: ['1s','2s','3s','4s','5s','0s','6s','7s','8s','9s'] },
  { label: '字牌', tiles: ['1z','2z','3z','4z','5z','6z','7z'] },
]

const SUIT_ORDER = { m: 0, p: 1, s: 2, z: 3 }

const MELD_LABELS = { chi: 'チー', pon: 'ポン', kan: '大明槓', kakan: '加槓', ankan: '暗槓' }
const MELD_TILE_COUNT = { chi: 3, pon: 3, kan: 4, kakan: 4, ankan: 4 }
const MELD_TYPES = ['chi', 'pon', 'kan', 'kakan', 'ankan']

function sortTiles(tiles) {
  return [...tiles].sort((a, b) => {
    const suitA = a.slice(-1), suitB = b.slice(-1)
    if (suitA !== suitB) return SUIT_ORDER[suitA] - SUIT_ORDER[suitB]
    const nA = a[0] === '0' ? 5.5 : parseInt(a[0])
    const nB = b[0] === '0' ? 5.5 : parseInt(b[0])
    return nA - nB
  })
}

function TileImg({ tile, size = 44, onClick, className = '' }) {
  const url = getTileImageUrl(tile)
  return (
    <button className={`tile-btn ${className}`} onClick={onClick} title={getTileLabel(tile)}>
      {url
        ? <img src={url} width={size} height={Math.round(size * 60 / 44)} alt={tile} />
        : <span className="tile-code">{tile}</span>
      }
    </button>
  )
}

function MeldPreview({ meld }) {
  const { type, tiles } = meld
  return (
    <div className="meld-preview">
      {tiles.map((t, i) => {
        const isRotated = type !== 'ankan' && i === 0
        const isBack = type === 'ankan' && (i === 0 || i === 3)
        if (isBack) return <div key={i} className="meld-preview-back" />
        return (
          <div key={i} className={`meld-preview-tile${isRotated ? ' meld-preview-tile--rotated' : ''}`}>
            <img src={getTileImageUrl(t)} alt={t} width={30} height={Math.round(30 * 60 / 44)} />
          </div>
        )
      })}
    </div>
  )
}

export default function ProblemEditor({ problem, onSave }) {
  const [tiles,     setTiles]     = useState(sortTiles(problem.tiles))
  const [answer,    setAnswer]    = useState(problem.answer)
  const [dora,      setDora]      = useState(problem.dora ?? null)
  const [riichi,    setRiichi]    = useState(problem.riichi ?? null)
  const [melds,     setMelds]     = useState(problem.melds ?? [])
  const [addingMeld, setAddingMeld] = useState(null) // { type, tiles: [] }

  function addTile(tile) {
    setTiles(prev => sortTiles([...prev, tile]))
  }

  function removeTile(index) {
    setTiles(prev => {
      const removed = prev[index]
      const next = prev.filter((_, i) => i !== index)
      if (answer === removed && !next.includes(removed)) setAnswer('')
      return next
    })
  }

  // 鳴き追加フロー
  function startAddMeld(type) {
    setAddingMeld({ type, tiles: [] })
  }

  function addTileToMeld(tile) {
    setAddingMeld(prev => {
      if (!prev) return null
      const maxCount = MELD_TILE_COUNT[prev.type]
      if (prev.tiles.length >= maxCount) return prev
      return { ...prev, tiles: [...prev.tiles, tile] }
    })
  }

  function removeTileFromMeld(index) {
    setAddingMeld(prev => prev ? { ...prev, tiles: prev.tiles.filter((_, i) => i !== index) } : null)
  }

  function confirmMeld() {
    if (!addingMeld) return
    const required = MELD_TILE_COUNT[addingMeld.type]
    if (addingMeld.tiles.length < required) return
    setMelds(prev => [...prev, { type: addingMeld.type, tiles: addingMeld.tiles }])
    setAddingMeld(null)
  }

  function removeMeld(index) {
    setMelds(prev => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    onSave({ ...problem, tiles, answer, dora: dora || null, riichi, melds })
  }

  const isAddingComplete = addingMeld && addingMeld.tiles.length === MELD_TILE_COUNT[addingMeld.type]

  return (
    <div className="editor">
      <div className="editor-header">
        <h3 className="editor-title">{problem.section.replace(/^\d+_/, '')} — ID {problem.id}</h3>
      </div>

      {/* 問題画像 */}
      <div className="editor-image-wrap">
        <img src={problem.image} alt="問題" className="editor-image" />
      </div>

      {/* 現在の手牌 */}
      <section className="editor-section">
        <div className="editor-section-label">
          手牌（クリックで削除）<span className="tile-count">{tiles.length}枚</span>
        </div>
        <div className="editor-hand-row">
          <div className="editor-tiles">
            {tiles.map((t, i) => (
              <TileImg
                key={i}
                tile={t}
                onClick={() => removeTile(i)}
                className={`editor-tile ${answer === t ? 'tile--answer' : ''}`}
              />
            ))}
            {tiles.length === 0 && <span className="editor-empty">牌を追加してください</span>}
          </div>
          {melds.length > 0 && (
            <div className="editor-melds-inline">
              {melds.map((meld, i) => (
                <div key={i} className="editor-meld-inline-item">
                  <span className="editor-meld-inline-label">{MELD_LABELS[meld.type]}</span>
                  <MeldPreview meld={meld} />
                  <button className="editor-meld-inline-remove" onClick={() => removeMeld(i)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 牌パレット */}
      <section className="editor-section">
        <div className="editor-section-label">牌パレット（クリックで手牌に追加）</div>
        {TILE_GROUPS.map(group => (
          <div key={group.label} className="palette-row">
            <span className="palette-label">{group.label}</span>
            <div className="palette-tiles">
              {group.tiles.map(t => (
                <TileImg key={t} tile={t} size={36} onClick={() => addTile(t)} className="palette-tile" />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* 副露（鳴き）セクション */}
      <section className="editor-section">
        <div className="editor-section-label">副露（鳴き）</div>

        {/* 副露追加UI */}
        {addingMeld ? (
          <div className="meld-adding">
            <div className="meld-adding-header">
              <span className="meld-adding-title">
                {MELD_LABELS[addingMeld.type]}：牌を選択
                （{addingMeld.tiles.length} / {MELD_TILE_COUNT[addingMeld.type]}枚）
              </span>
              <button className="meld-cancel-btn" onClick={() => setAddingMeld(null)}>キャンセル</button>
            </div>

            {/* 選択中の牌 */}
            <div className="meld-selected-tiles">
              {addingMeld.tiles.map((t, i) => (
                <TileImg key={i} tile={t} size={36} onClick={() => removeTileFromMeld(i)} className="editor-tile" />
              ))}
              {Array.from({ length: MELD_TILE_COUNT[addingMeld.type] - addingMeld.tiles.length }).map((_, i) => (
                <div key={`empty-${i}`} className="meld-tile-slot" />
              ))}
            </div>

            {/* 牌選択パレット */}
            <div className="meld-palette">
              {TILE_GROUPS.map(group => (
                <div key={group.label} className="palette-row">
                  <span className="palette-label">{group.label}</span>
                  <div className="palette-tiles">
                    {group.tiles.map(t => (
                      <TileImg
                        key={t} tile={t} size={32}
                        onClick={() => addTileToMeld(t)}
                        className={`palette-tile${isAddingComplete ? ' palette-tile--disabled' : ''}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              className={`meld-confirm-btn${isAddingComplete ? ' meld-confirm-btn--ready' : ''}`}
              onClick={confirmMeld}
              disabled={!isAddingComplete}
            >
              副露を追加
            </button>
          </div>
        ) : (
          <div className="meld-add-btns">
            {MELD_TYPES.map(type => (
              <button key={type} className="meld-add-btn" onClick={() => startAddMeld(type)}>
                {MELD_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ドラ牌 */}
      <section className="editor-section">
        <div className="editor-section-label">
          ドラ牌
          <button className="dora-clear" onClick={() => setDora(null)}>なし</button>
        </div>
        <div className="editor-current">
          現在のドラ: <strong>{dora ? getTileLabel(dora) : 'なし'}</strong>
        </div>
        <div>
          {TILE_GROUPS.map(group => (
            <div key={group.label} className="palette-row">
              <span className="palette-label">{group.label}</span>
              <div className="palette-tiles">
                {group.tiles.map(t => (
                  <TileImg
                    key={t}
                    tile={t}
                    size={36}
                    onClick={() => setDora(t)}
                    className={`palette-tile ${dora === t ? 'tile--answer' : ''}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 正解牌 */}
      <section className="editor-section">
        <div className="editor-section-label">正解牌（手牌からクリックで選択）</div>
        <div className="editor-tiles">
          {[...new Set(tiles)].map(t => (
            <TileImg
              key={t}
              tile={t}
              onClick={() => setAnswer(t)}
              className={`editor-tile ${answer === t ? 'tile--answer' : ''}`}
            />
          ))}
        </div>
        <div className="editor-current">
          現在の正解: <strong>{answer ? getTileLabel(answer) : '未設定'}</strong>
        </div>
        <div className="riichi-setting">
          <span className="riichi-setting-label">リーチ：</span>
          <button
            className={`riichi-setting-btn ${riichi === true ? 'riichi-setting-btn--active' : ''}`}
            onClick={() => setRiichi(true)}
          >する</button>
          <button
            className={`riichi-setting-btn ${riichi === false ? 'riichi-setting-btn--active' : ''}`}
            onClick={() => setRiichi(false)}
          >しない</button>
          <button
            className={`riichi-setting-btn ${riichi === null ? 'riichi-setting-btn--active' : ''}`}
            onClick={() => setRiichi(null)}
          >設定なし</button>
        </div>
      </section>

      {/* 保存 */}
      <button className="editor-save-btn" onClick={handleSave}>保存</button>
    </div>
  )
}
