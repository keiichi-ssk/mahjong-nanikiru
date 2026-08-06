import { getTileImageUrl, getTileLabel } from '../../../utils/tileUtils'
import { NAKI_TIMING_OPTIONS } from '../../../utils/problemConstants'
import { isOrphanAnswer } from '../../../utils/answerEdit'
import TileImg from '../TileImg'
import { TextCount } from '../FormParts'

function answerTokenLabel(token) {
  return token.startsWith('ankan:') ? `暗槓（${getTileLabel(token.slice(6))}）` : getTileLabel(token)
}

// 現在の正解1つぶん。× で解除する（正解の追加は下の牌パレットから）。
// 手牌がある問題で、その手牌に無い牌が残っている場合だけ警告を出す
// （手牌が空の問題＝画像だけの問題では警告しない）
function AnswerChip({ token, tiles, onRemove }) {
  const missing = isOrphanAnswer(token, tiles)
  return (
    <span className={`answer-chip${missing ? ' answer-chip--missing' : ''}`}>
      {answerTokenLabel(token)}
      {missing && <span className="answer-chip-warn" title="手牌にありません">⚠</span>}
      <button className="answer-chip-remove" onClick={onRemove} title="この正解を外す">×</button>
    </span>
  )
}

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
          {/* ★ 正解の牌は下の牌パレットから選ぶ（2026-08-06〜）。
              手牌の牌をクリックする方式だと、手牌が空の問題（画像だけの問題）に
              正解を設定できなかった。ここに牌を並べ直さないこと */}
          <div className="editor-section-label">正解牌（下の牌パレットをクリックで追加/解除・複数選択可）</div>
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
          <div className="editor-current">現在の正解（× で解除）:</div>
          {answerList.length > 0 ? (
            <div className="answer-chips">
              {answerList.map(a => (
                <AnswerChip key={a} token={a} tiles={tiles} onRemove={() => toggleAnswer(a)} />
              ))}
            </div>
          ) : (
            <div className="editor-current"><strong>未設定</strong></div>
          )}
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
          {/* ★ 何切ると同じく、正解の牌は下の牌パレットから選ぶ（2026-08-06〜）。
              ここに手牌を並べ直さないこと */}
          <div className="editor-section-label">正解牌（下の牌パレットを安全な順にクリック・再クリックで解除。①が最も安全）</div>
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
                    (isOrphanAnswer(a, tiles) ? ' editor-order-tile--missing' : '') +
                    (answerDragIndex === i ? ' editor-order-tile--dragging' : '') +
                    (answerDropIndex === i ? ' editor-order-tile--drop-before' : '') +
                    (answerDropIndex === i + 1 && i === answerList.length - 1 ? ' editor-order-tile--drop-after' : '')
                  }
                  {...answerDragHandlers}
                >
                  <img src={getTileImageUrl(a)} alt={getTileLabel(a)} draggable={false} />
                  <span className="editor-order-badge">{i + 1}</span>
                  {/* パレットの同じ牌を押しても解除できるが、並びを見ながら外せるよう
                      ここにも × を置く。onPointerDown を止めないと押した時点でドラッグが始まる */}
                  <button
                    className="editor-order-remove"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => toggleAnswer(a)}
                    title="この正解を外す"
                  >×</button>
                </div>
              ))}
            </div>
          ) : (
            <span className="editor-empty">未設定（下の牌パレットを安全な順にクリック）</span>
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
