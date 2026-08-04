// 風選択（未設定 + 東南西北など）。suffix はボタン表示の接尾辞（場/家）。
// selfWind を渡すと、その風のボタンに「（自家）」を付けて自分の家だと分かるようにする
export function WindSelector({ value, onChange, winds, suffix = '', selfWind = null }) {
  return (
    <div className="situation-selector">
      <button
        className={`situation-btn situation-btn--unset${value === null ? ' situation-btn--active' : ''}`}
        onClick={() => onChange(null)}
      >
        未設定
      </button>
      {winds.map(wind => (
        <button
          key={wind}
          className={`situation-btn${value === wind ? ' situation-btn--active' : ''}`}
          onClick={() => onChange(wind)}
        >
          {wind}{suffix}{selfWind && wind === selfWind ? '（自家）' : ''}
        </button>
      ))}
    </div>
  )
}

// 入力欄の残数表示（textLimits を渡したときだけ出る）
export function TextCount({ len, max }) {
  return (
    <span className={`editor-text-count${len >= max ? ' editor-text-count--full' : ''}`}>
      {len} / {max}
    </span>
  )
}
