// 点数入力の1組。右カラムの幅では「家名 + ±ステッパー + 入力」が1行に収まらないため、
// 家名を1行目・操作を2行目に分ける（折り返すと行の対応が読み取れなくなるため）。
// 入力中は任意の数字を受け付け、確定（blur）時に100点単位へ丸める
export function ScoreInputRow({ label, isSelf, active, value, onChange, steps }) {
  return (
    <div
      className={
        'score-edit-row' +
        (isSelf ? ' score-edit-row--self' : '') +
        (active ? ' score-edit-row--active' : '')
      }
    >
      <div className="score-edit-wind">
        {label}
        {isSelf && <span className="score-edit-self">自分</span>}
      </div>
      <div className="score-edit-controls">
        {steps.filter(s => s < 0).map(s => (
          <button key={s} className="score-step-btn" onClick={() => onChange(Math.max(0, value + s))}>
            −{-s}
          </button>
        ))}
        <input
          type="text"
          inputMode="numeric"
          className="score-edit-input"
          value={value}
          onFocus={e => e.target.select()}
          onChange={e => {
            const n = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10)
            onChange(Number.isNaN(n) ? 0 : n)
          }}
          onBlur={() => onChange(Math.max(0, Math.round(value / 100) * 100))}
        />
        {steps.filter(s => s > 0).map(s => (
          <button key={s} className="score-step-btn" onClick={() => onChange(value + s)}>
            +{s}
          </button>
        ))}
      </div>
    </div>
  )
}

// スマホの点数入力（1家ぶんのポップアップ）。
// ScoreInputRow の「家名＋±6個＋入力」は右カラムの幅（500px）を前提にした形で、
// スマホでは横にはみ出す。家をタップして開くシートに分けることで、
// ボタンを 44px 以上に取れる（タップ標的のルール）。
// ± は「−と＋を同じ額で左右に並べる」ので、金額の対応が縦に読み取れる
export function ScoreSheet({ label, isSelf, value, steps, onChange, onClose }) {
  const minus = steps.filter(s => s < 0).sort((a, b) => a - b)   // −10000, −1000, −100
  const plus  = steps.filter(s => s > 0).sort((a, b) => b - a)   // +10000, +1000, +100
  const rows  = minus.map((m, i) => [m, plus[i]])

  return (
    // 背景をタップしても閉じる（シート自体のタップは伝播を止める）
    <div className="score-sheet-backdrop" onClick={onClose}>
      <div
        className="score-sheet"
        role="dialog"
        aria-label={`${label}の点数`}
        onClick={e => e.stopPropagation()}
      >
        <div className="score-sheet-title">
          {label}
          {isSelf && <span className="score-edit-self">自分</span>}
        </div>
        <input
          type="text"
          inputMode="numeric"
          className="score-sheet-input"
          value={value}
          onFocus={e => e.target.select()}
          onChange={e => {
            const n = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10)
            onChange(Number.isNaN(n) ? 0 : n)
          }}
          onBlur={() => onChange(Math.max(0, Math.round(value / 100) * 100))}
        />
        <div className="score-sheet-steps">
          {rows.map(([m, p]) => (
            <div className="score-sheet-step-row" key={m}>
              <button className="score-sheet-step" onClick={() => onChange(Math.max(0, value + m))}>
                −{-m}
              </button>
              <button className="score-sheet-step" onClick={() => onChange(value + p)}>
                +{p}
              </button>
            </div>
          ))}
        </div>
        <button className="score-sheet-close" onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
