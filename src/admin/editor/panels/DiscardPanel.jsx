import { getTileImageUrl, getTileLabel } from '../../../utils/tileUtils'
import { MELD_TYPE_LABELS } from '../../../utils/problemConstants'
import { clearDiscardTiles } from '../../../utils/discardEdit'
import { WindSelector } from '../FormParts'
import { MeldPreview, MeldFromSelect, MeldTypeTabs, MeldAddingPanel } from '../MeldParts'

// 捨て牌パネル（自分を含む各家の河。データ構造の都合で変数名は otherDiscards のまま）。
//
// 牌の並べ替えは HTML5 DnD のままなので**マウス専用**（タッチでは動かない）。
// スマホでは巡目順にタップして足していくので並べ替えは要らない、という判断（2026-08-01）。
// useDragReorder へ移すには、6列グリッドに対応した2次元の挿入位置判定が要る
export default function DiscardPanel({
  otherDiscards, jikaze,
  activeSutehaiIdx, setSutehaiActiveIdx,
  updateOtherDiscard, addOtherDiscardBlock, removeOtherDiscardBlock,
  removeOtherDiscardTile, moveOtherDiscardTile, toggleOtherDiscardRiichi,
  sutehaiDrag, setSutehaiDrag, sutehaiDropIndex, setSutehaiDropIndex, updateSutehaiDropIndex,
  addingMeld, setAddingMeld, startAddOtherDiscardMeld, removeTileFromMeld, changeAddingMeldFrom,
  updateOtherDiscardMeldFrom, removeOtherDiscardMeld,
  otherDiscardIncomplete, otherDiscardDuplicatePlayer,
}) {
  return (
    <div className="palette-tab-content">
      {otherDiscards.map((od, bi) => (
        <div
          key={bi}
          className={`other-discard-block${activeSutehaiIdx === bi ? ' other-discard-block--active' : ''}`}
          onClick={() => setSutehaiActiveIdx(bi)}
        >
          <div className="editor-section-label">
            家{otherDiscards.length > 1 ? `（${bi + 1}人目${activeSutehaiIdx === bi ? '・牌の追加先' : ''}）` : ''}
            <button
              className="dora-clear"
              onClick={e => { e.stopPropagation(); removeOtherDiscardBlock(bi) }}
            >
              この家を削除
            </button>
          </div>
          <WindSelector
            value={od.player}
            onChange={v => updateOtherDiscard(bi, o => ({ ...o, player: v }))}
            winds={['東', '南', '西', '北']}
            suffix="家"
            selfWind={jikaze}
          />

          <div className="editor-section-label">
            捨て牌（クリックでリーチ宣言牌に設定/解除、×で削除）
            {od.tiles.length > 0 && (
              <button
                className="dora-clear"
                onClick={() => updateOtherDiscard(bi, clearDiscardTiles)}
              >
                全削除
              </button>
            )}
          </div>
          <div
            className="other-discard-tiles-list"
            onDragOver={e => {
              // 牌の隙間・末尾の空き領域では末尾への挿入とみなす（牌上は各アイテム側で処理）
              if (sutehaiDrag?.block !== bi) return
              e.preventDefault()
              updateSutehaiDropIndex(od.tiles.length)
            }}
            onDrop={e => {
              e.preventDefault()
              if (sutehaiDrag?.block === bi && sutehaiDropIndex !== null) {
                moveOtherDiscardTile(bi, sutehaiDrag.index, sutehaiDropIndex)
              }
              setSutehaiDrag(null)
              setSutehaiDropIndex(null)
            }}
          >
            {od.tiles.map((t, i) => (
              <div
                key={i}
                className={
                  `other-discard-tile-item${od.riichiIndex === i ? ' other-discard-tile-item--riichi' : ''}` +
                  `${sutehaiDrag?.block === bi && sutehaiDrag.index === i ? ' other-discard-tile-item--dragging' : ''}` +
                  `${sutehaiDrag?.block === bi && sutehaiDropIndex === i ? ' other-discard-tile-item--drop-before' : ''}` +
                  `${sutehaiDrag?.block === bi && sutehaiDropIndex === i + 1 && i === od.tiles.length - 1 ? ' other-discard-tile-item--drop-after' : ''}`
                }
                draggable
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', '') // Firefoxはこれが無いとドラッグが始まらない
                  setSutehaiDrag({ block: bi, index: i })
                }}
                onDragEnd={() => { setSutehaiDrag(null); setSutehaiDropIndex(null) }}
                onDragOver={e => {
                  if (sutehaiDrag?.block !== bi) return
                  e.preventDefault()
                  e.stopPropagation()
                  // カーソルが牌の左半分なら前、右半分なら後ろに挿入
                  const rect = e.currentTarget.getBoundingClientRect()
                  updateSutehaiDropIndex(e.clientX < rect.left + rect.width / 2 ? i : i + 1)
                }}
              >
                <button className="other-discard-tile-remove" onClick={() => removeOtherDiscardTile(bi, i)}>×</button>
                <div
                  className={`other-discard-tile-img-wrap${od.riichiIndex === i ? ' tile-rotated' : ''}`}
                  onClick={() => toggleOtherDiscardRiichi(bi, i)}
                  title={getTileLabel(t)}
                >
                  <img src={getTileImageUrl(t)} alt={getTileLabel(t)} />
                </div>
              </div>
            ))}
            {od.tiles.length === 0 && <span className="editor-empty">牌を追加してください</span>}
          </div>

          <div className="editor-section-label">副露（鳴き）</div>
          {od.melds.length > 0 && (
            <div className="editor-melds-inline">
              {od.melds.map((meld, mi) => (
                <div key={mi} className="editor-meld-inline-item">
                  <span className="editor-meld-inline-label">
                    {MELD_TYPE_LABELS[meld.type]}
                    <MeldFromSelect
                      type={meld.type}
                      value={meld.from}
                      onChange={f => updateOtherDiscardMeldFrom(bi, mi, f)}
                    />
                  </span>
                  <MeldPreview meld={meld} />
                  <button className="editor-meld-inline-remove" onClick={() => removeOtherDiscardMeld(bi, mi)}>×</button>
                </div>
              ))}
            </div>
          )}
          {/* 手牌の副露と同じサブタブ。こちらは揃った時点で解除して捨て牌の送り先へ戻る */}
          <MeldTypeTabs
            active={addingMeld?.target === bi ? addingMeld.type : null}
            onSelect={type => startAddOtherDiscardMeld(bi, type)}
          />
          {addingMeld?.target === bi && (
            <MeldAddingPanel
              meld={addingMeld}
              onCancel={() => setAddingMeld(null)}
              onRemoveTile={removeTileFromMeld}
              onChangeFrom={changeAddingMeldFrom}
            />
          )}
        </div>
      ))}
      {otherDiscards.length < 4 && (
        <button className="other-discard-add-block" onClick={addOtherDiscardBlock}>
          ＋ 家を追加（自分を含め最大4人）
        </button>
      )}
      {otherDiscardIncomplete && (
        <div className="other-discard-warning">
          ⚠ 家と捨て牌の両方を設定してください。揃っていない家は（副露も含めて）保存されません。
        </div>
      )}
      {otherDiscardDuplicatePlayer && (
        <div className="other-discard-warning">
          ⚠ 同じ家が複数設定されています。重複した家は最初の1つだけ保存されます。
        </div>
      )}
    </div>
  )
}
