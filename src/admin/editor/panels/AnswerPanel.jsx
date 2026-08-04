import { getTileImageUrl, getTileLabel } from '../../../utils/tileUtils'
import { NAKI_TIMING_OPTIONS } from '../../../utils/problemConstants'
import TileImg from '../TileImg'
import { TextCount } from '../FormParts'

// 正解設定パネル（正解設定・解説に挿入のタブから開く）。
// 問題タイプごとに中身が変わり、末尾の解説テキストだけが共通。
// ※ 正誤判定そのものは utils/judgeUtils.js にあり、ここは入力UIだけを持つ
export default function AnswerPanel({
  problemType,
  tiles, answerList, toggleAnswer,
  riichi, setRiichi,
  answer, setAnswer, discardedTile, setDiscardedTile,
  nakiChoices, toggleNakiChoiceCorrect, removeNakiChoice,
  answerOrderRef, answerDragIndex, answerDropIndex, answerDragHandlers,
  explanation, setExplanation, explanationRef, explanationTouchedRef, setPaletteMode,
  textLimits, boardLocked, noteEditor,
}) {
  return (
    <div className="palette-tab-content">
      {/* 通常（何切る） */}
      {problemType === 'default' && (
        <>
          <div className="editor-section-label">正解牌（クリックで追加/解除・複数選択可）</div>
          <div className="editor-tiles">
            {[...new Set(tiles)].map(t => (
              <TileImg
                key={t} tile={t}
                onClick={() => toggleAnswer(t)}
                className={`editor-tile ${answerList.includes(t) ? 'tile--answer' : ''}`}
              />
            ))}
          </div>
          {(() => {
            const counts = {}
            tiles.forEach(t => { counts[t] = (counts[t] ?? 0) + 1 })
            const quadTiles = Object.keys(counts).filter(t => counts[t] === 4)
            if (quadTiles.length === 0) return null
            return (
              <div className="editor-ankan-options">
                {quadTiles.map(t => (
                  <button
                    key={t}
                    className={`editor-ankan-btn${answerList.includes(`ankan:${t}`) ? ' editor-ankan-btn--active' : ''}`}
                    onClick={() => toggleAnswer(`ankan:${t}`)}
                  >
                    カン
                    <img src={getTileImageUrl(t)} alt={getTileLabel(t)} />
                  </button>
                ))}
              </div>
            )
          })()}
          <div className="editor-current">
            現在の正解: <strong>
              {answerList.length > 0
                ? answerList
                    .map(a => a.startsWith('ankan:') ? `暗槓（${getTileLabel(a.slice(6))}）` : getTileLabel(a))
                    .join('・')
                : '未設定'}
            </strong>
          </div>
          <div className="riichi-setting">
            <span className="riichi-setting-label">リーチ：</span>
            <button
              className={`riichi-setting-btn ${riichi === true  ? 'riichi-setting-btn--active' : ''}`}
              onClick={() => setRiichi(true)}
            >する</button>
            <button
              className={`riichi-setting-btn ${riichi === false ? 'riichi-setting-btn--active' : ''}`}
              onClick={() => setRiichi(false)}
            >しない</button>
            <button
              className={`riichi-setting-btn ${riichi === null  ? 'riichi-setting-btn--active' : ''}`}
              onClick={() => setRiichi(null)}
            >設定なし</button>
          </div>
        </>
      )}

      {/* リーチ判断 */}
      {problemType === 'riichi-judgment' && (
        <>
          <div className="editor-section-label">正解（リーチ or ダマ）</div>
          <div className="problem-type-selector">
            <button
              className={`problem-type-btn${riichi === true  ? ' problem-type-btn--active' : ''}`}
              onClick={() => setRiichi(true)}
            >リーチ</button>
            <button
              className={`problem-type-btn${riichi === false ? ' problem-type-btn--active' : ''}`}
              onClick={() => setRiichi(false)}
            >ダマ</button>
          </div>
          <div className="editor-current">
            現在の正解: <strong>{riichi === true ? 'リーチ' : riichi === false ? 'ダマ' : '未設定'}</strong>
          </div>
        </>
      )}

      {/* 鳴きタイミング */}
      {problemType === 'naki-timing' && (
        <>
          <div className="editor-section-label">
            出た牌（他家の打牌）
            {discardedTile && (
              <button className="dora-clear" onClick={() => setDiscardedTile(null)}>クリア</button>
            )}
          </div>
          <div className="editor-current palette-tab-status">
            現在の出牌: <strong>{discardedTile ? getTileLabel(discardedTile) : '未設定'}</strong>
            {discardedTile && (
              <img
                src={getTileImageUrl(discardedTile)}
                alt={getTileLabel(discardedTile)}
                className="palette-tab-status-tile"
              />
            )}
          </div>
          <div className="palette-tab-divider" />
          <div className="editor-section-label">正解タイミング</div>
          <div className="naki-timing-selector">
            {NAKI_TIMING_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`naki-timing-btn${answer === opt.value ? ' naki-timing-btn--active' : ''}`}
                onClick={() => setAnswer(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="editor-current">
            現在の正解: <strong>{NAKI_TIMING_OPTIONS.find(o => o.value === answer)?.label ?? '未設定'}</strong>
          </div>
        </>
      )}

      {/* 鳴き選択 */}
      {problemType === 'naki-choice' && (
        <>
          <div className="editor-section-label">選択肢（何が出たら鳴くか）</div>
          {nakiChoices.length > 0 && (
            <div className="naki-choices-list">
              {nakiChoices.map((c, i) => (
                <div key={i} className="naki-choice-item">
                  <TileImg tile={c.tile} size={32} onClick={() => {}} className="palette-tile" />
                  <span className="naki-choice-tile-name">{getTileLabel(c.tile)}</span>
                  <button
                    className={`naki-choice-correct-btn${c.correct ? ' naki-choice-correct-btn--on' : ''}`}
                    onClick={() => toggleNakiChoiceCorrect(i)}
                  >
                    {c.correct ? '正解' : '不正解'}
                  </button>
                  <button className="naki-choice-remove-btn" onClick={() => removeNakiChoice(i)}>×</button>
                </div>
              ))}
            </div>
          )}
          {nakiChoices.length === 0 && <span className="editor-empty">下のパレットから選択肢を追加してください</span>}
        </>
      )}

      {/* ベタオリ（安全な順に並べる） */}
      {problemType === 'betaori' && (
        <>
          <div className="editor-section-label">正解牌（安全な順にクリック・再クリックで解除。①が最も安全）</div>
          <div className="editor-tiles">
            {[...new Set(tiles)].map(t => {
              const pos = answerList.indexOf(t)
              return (
                <span key={t} className="editor-order-tile">
                  <TileImg
                    tile={t}
                    onClick={() => toggleAnswer(t)}
                    className={`editor-tile ${pos >= 0 ? 'tile--answer' : ''}`}
                  />
                  {pos >= 0 && <span className="editor-order-badge">{pos + 1}</span>}
                </span>
              )
            })}
            {tiles.length === 0 && <span className="editor-empty">先に手牌を設定してください</span>}
          </div>
          <div className="editor-current">
            現在の正解（ドラッグで入れ替え・{answerList.length}枚 — 出題画面でもこの枚数を選ばせます）:
          </div>
          {answerList.length > 0 ? (
            <div className="editor-order-list" ref={answerOrderRef}>
              {answerList.map((a, i) => (
                <div
                  key={a}
                  data-drag-index={i}
                  className={
                    'editor-order-tile editor-order-tile--draggable' +
                    (answerDragIndex === i ? ' editor-order-tile--dragging' : '') +
                    (answerDropIndex === i ? ' editor-order-tile--drop-before' : '') +
                    (answerDropIndex === i + 1 && i === answerList.length - 1 ? ' editor-order-tile--drop-after' : '')
                  }
                  {...answerDragHandlers}
                >
                  <img src={getTileImageUrl(a)} alt={getTileLabel(a)} draggable={false} />
                  <span className="editor-order-badge">{i + 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="editor-empty">未設定（上の手牌をクリックして安全な順に追加）</span>
          )}
        </>
      )}

      <div className="palette-tab-divider" />
      <div className="editor-section-label">
        解説テキスト
        {textLimits?.explanation && (
          <TextCount len={explanation.length} max={textLimits.explanation} />
        )}
      </div>
      <textarea
        ref={explanationRef}
        className="explanation-textarea"
        value={explanation}
        onChange={e => setExplanation(e.target.value)}
        onFocus={() => { explanationTouchedRef.current = true; setPaletteMode('explanation') }}
        placeholder="解説を入力してください（牌は下のパレットからカーソル位置に挿入できます）"
        rows={3}
        maxLength={textLimits?.explanation ?? undefined}
      />

      {/* 盤面ロック中は手牌パネルが無いので、注釈をここに出す */}
      {boardLocked && noteEditor}
    </div>
  )
}
