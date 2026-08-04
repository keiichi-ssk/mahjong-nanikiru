import { MELD_TYPE_LABELS } from '../../../utils/problemConstants'
import { newAddingMeld } from '../constants'
import { MeldPreview, MeldFromSelect, MeldTypeTabs, MeldAddingPanel } from '../MeldParts'

// 手牌パネル（手牌・副露・出題注釈のタブから開く）。
// 手牌そのものは盤面で編集するので、ここにあるのはテキスト一括入力・副露・注釈だけ
// （右パネルに手牌の一覧を戻さないこと。1画面で編集できる縦の長さを保つため）
export default function HandPanel({
  tiles, setTiles, tilesInput, setTilesInput, applyTilesText,
  melds, updateMeldFrom, removeMeld,
  addingMeld, setAddingMeld, startAddMeld, removeTileFromMeld, changeAddingMeldFrom,
  paletteTab, noteEditor,
}) {
  return (
    <div className="palette-tab-content">
      <div className="editor-section-label">テキスト一括入力</div>
      <div className="tiles-text-input-row">
        <input
          type="text"
          className="tiles-text-input"
          value={tilesInput}
          onChange={e => setTilesInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyTilesText()
            }
          }}
          placeholder="例: 23467m234p234888s（Enterで適用）"
        />
        <button
          className="tiles-text-apply-btn"
          onClick={applyTilesText}
        >
          適用
        </button>
        <button
          className="tiles-text-apply-btn tiles-text-clear-btn"
          onClick={() => setTiles([])}
        >
          全削除
        </button>
      </div>

      <div className="palette-tab-divider" />
      <div className="editor-section-label">
        副露（鳴き）<span className="tile-count">手牌 {tiles.length}枚</span>
      </div>
      {melds.length > 0 && (
        <div className="editor-melds-inline">
          {melds.map((meld, i) => (
            <div key={i} className="editor-meld-inline-item">
              <span className="editor-meld-inline-label">
                {MELD_TYPE_LABELS[meld.type]}
                <MeldFromSelect type={meld.type} value={meld.from} onChange={f => updateMeldFrom(i, f)} />
              </span>
              <MeldPreview meld={meld} />
              <button className="editor-meld-inline-remove" onClick={() => removeMeld(i)}>×</button>
            </div>
          ))}
        </div>
      )}
      {/* 副露の種類はサブタブで選ぶ。押した時点で入力が始まる（＝選択中の牌はクリア） */}
      <MeldTypeTabs
        active={addingMeld?.target === 'hand' ? addingMeld.type : null}
        onSelect={startAddMeld}
      />
      {addingMeld?.target === 'hand' && (
        <MeldAddingPanel
          meld={addingMeld}
          // 副露タブは入力待ちのままなのが正しい状態なので、解除ではなく牌のクリアにする
          cancelLabel={paletteTab === 'meld' ? 'クリア' : 'キャンセル'}
          onCancel={() => setAddingMeld(
            paletteTab === 'meld' ? newAddingMeld(addingMeld.type, 'hand') : null
          )}
          onRemoveTile={removeTileFromMeld}
          onChangeFrom={changeAddingMeldFrom}
        />
      )}

      {/* 注釈は手牌と一緒に書くことが多いのでこのパネルに置く（点数パネルには置かない）。
          盤面ロック中はこのパネル自体が出ないので、正解設定パネルに同じものを出す */}
      {noteEditor}
    </div>
  )
}
