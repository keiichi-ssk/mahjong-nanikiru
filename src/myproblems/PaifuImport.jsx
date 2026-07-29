import { useRef } from 'react'
import { getTileImageUrl, getTileLabel } from '../utils/tileUtils'
import { STEP_FILTERS, stepLabel } from '../utils/tenhouPaifu'

// 牌譜から局面を切り出すためのナビ。エディタのヘッダー行（headerLead）に差し込んで使う。
// 計画: docs/user-problems-plan.md の Phase 5b
//
// ★ このコンポーネントは表示と入力の受け渡しだけを持つ。
//   牌譜の解釈（再生・検証）は utils/tenhouPaifu.js（純粋関数）、
//   state と保存は MyProblemsApp が持つ。判定ロジックをここに書き戻さないこと。
//
// 取り込む牌譜は「ユーザーが自分で用意した JSON ファイル」だけを受け取る。
// アプリから雀魂などのサーバーへ取りに行くことはしないし、
// 取得手順の案内もここには置かない（docs/user-problems-plan.md 8-3 の方針）。

export default function PaifuImport({
  paifu, fileName, error,
  rounds = [], roundIndex, seat,
  steps = [], stepIndex, stepFilter, step,
  saved,
  categories = [], categoryId,
  onPickFile, onChangeRound, onChangeSeat, onChangeStep, onChangeFilter, onChangeCategory,
}) {
  const fileRef = useRef(null)
  const position = steps.findIndex(s => s.index === stepIndex)

  return (
    <div className="paifu-nav">
      <div className="paifu-nav-row">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="paifu-file-input"
          // 同じファイルを選び直しても change が起きるように値を消す
          onChange={e => { onPickFile(e.target.files?.[0]); e.target.value = '' }}
        />
        <button
          className="mp-add-btn mp-add-btn--sm"
          onClick={() => fileRef.current?.click()}
          title="牌譜のJSONファイルを読み込む"
        >
          {paifu ? '別の牌譜' : '牌譜を読み込む'}
        </button>
        {fileName && <span className="paifu-file-name" title={fileName}>{fileName}</span>}
        {error && <span className="editor-save-err">{error}</span>}
      </div>

      {paifu && (
        <div className="paifu-nav-row">
          <div className="paifu-seats" role="group" aria-label="自分の席">
            {paifu.name.map((name, i) => (
              <button
                key={i}
                className={`paifu-seat${seat === i ? ' paifu-seat--active' : ''}`}
                onClick={() => onChangeSeat(i)}
                title={`${name} の視点にする`}
              >
                {name}
              </button>
            ))}
          </div>

          <select
            className="mp-cat-select"
            value={roundIndex}
            onChange={e => onChangeRound(Number(e.target.value))}
            title="局"
          >
            {rounds.map(r => (
              <option key={r.index} value={r.index}>
                {r.label}{r.result ? `（${r.result}）` : ''}
              </option>
            ))}
          </select>

          <select
            className="mp-cat-select"
            value={stepFilter}
            onChange={e => onChangeFilter(e.target.value)}
            title="どの瞬間を問題にするか"
          >
            {STEP_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          <div className="paifu-turn">
            <button
              className="mp-icon-btn"
              onClick={() => onChangeStep(steps[position - 1]?.index)}
              disabled={position <= 0}
              title="前の局面へ"
            >◀</button>
            <span className="paifu-turn-count">
              {position >= 0 ? position + 1 : '—'} / {steps.length}
            </span>
            <button
              className="mp-icon-btn"
              onClick={() => onChangeStep(steps[position + 1]?.index)}
              disabled={position < 0 || position >= steps.length - 1}
              title="次の局面へ"
            >▶</button>
          </div>

          {/* いまどの瞬間を見ているか。
              打牌直前なら「この後実際に切られる牌」、打牌直後なら「切られた牌」を出す。
              どちらも★正解ではない★（正解はこのあと自分で設定する） */}
          {step && (
            <span
              className="paifu-actual"
              title={step.kind === 'discard'
                ? 'この牌が切られた直後の局面（鳴くか・押すかを問える）'
                : 'この局面で実際に切られた牌（正解ではありません）'}
            >
              <span className="paifu-step-label">{stepLabel(step, seat)}</span>
              {(() => {
                const tile = step.kind === 'discard' ? step.tile : step.nextDiscard
                if (!tile) return null
                return (
                  <>
                    {getTileImageUrl(tile) && (
                      <img
                        className="paifu-actual-tile"
                        src={getTileImageUrl(tile)}
                        alt={tile}
                        width={22}
                        height={30}
                      />
                    )}
                    <span className="paifu-actual-label">
                      {getTileLabel(tile)}
                      {(step.kind === 'discard' ? step.riichi : step.nextRiichi) && '（リーチ）'}
                    </span>
                  </>
                )
              })()}
            </span>
          )}

          <label className="paifu-save-to">
            保存先
            <select
              className="mp-cat-select"
              value={categoryId ?? ''}
              onChange={e => onChangeCategory(e.target.value || null)}
            >
              <option value="">未分類</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          {/* 同じ局面を続けて保存してしまわないよう、保存済みなら知らせる */}
          {saved && <span className="paifu-saved">この局面は保存済み</span>}
        </div>
      )}
    </div>
  )
}
