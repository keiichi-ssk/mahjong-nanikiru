import { SCORE_WINDS, DEFAULT_SCORES } from '../constants'
import { ScoreInputRow } from '../ScoreParts'

// 点数パネル（タブ列には無く、盤面の点数チップから開く。スマホだけタブ列にも常設）。
// ドラ・場風・局・巡目は盤面の中央フィールドで直接設定するのでここには置かない
// （盤面を見ながら設定できるほうが速く、右カラムの縦の長さも抑えられる）
export default function ScorePanel({
  isNarrow, boardLocked, jikaze, setJikaze, scores, setScores, activeScoreWind, setScoreSheet,
}) {
  const total = SCORE_WINDS.reduce((sum, w) => sum + (scores[w] ?? 0), 0) + (scores.kyotaku ?? 0)
  const totalOk = total === 100000

  return (
    <div className="palette-tab-content">
      {/* 自風だけはスマホでもここから設定する。盤面の自風バッジは点数チップの中の
          小さいボタンなので、卓を縮小すると押しにくいため。
          局・本場・巡目は盤面中央のセレクタで足りるので出さない（入口を増やさない） */}
      {isNarrow && !boardLocked && (
        <label className="score-edit-jikaze">
          自風
          <select
            className="editor-type-select"
            value={jikaze ?? ''}
            onChange={e => setJikaze(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">—</option>
            {SCORE_WINDS.map(w => (
              <option key={w} value={w}>{w}家</option>
            ))}
          </select>
        </label>
      )}
      <div className="editor-section-label">点数状況</div>
      {/* 点数は常に既定値（全員25000）が入る仕様なので「未設定」の選択肢は置かない */}
      <div className="score-edit-area">
        {/* スマホは一覧＋ポップアップ。ScoreInputRow の2段レイアウトは
            右カラムの幅（500px）前提で、スマホでは横にはみ出すため */}
        {isNarrow
          ? [...SCORE_WINDS, 'kyotaku'].map(w => (
              <button
                key={w}
                className={
                  'score-list-row' +
                  (jikaze === w ? ' score-list-row--self' : '') +
                  (activeScoreWind === w ? ' score-list-row--active' : '')
                }
                onClick={() => setScoreSheet(w)}
              >
                <span className="score-list-wind">
                  {w === 'kyotaku' ? '供託' : `${w}家`}
                  {jikaze === w && <span className="score-edit-self">自分</span>}
                </span>
                <span className="score-list-value">{(scores[w] ?? 0).toLocaleString()}</span>
                <span className="score-list-caret">›</span>
              </button>
            ))
          : (
            <>
              {SCORE_WINDS.map(w => (
                <ScoreInputRow
                  key={w}
                  label={`${w}家`}
                  isSelf={jikaze === w}
                  active={activeScoreWind === w}
                  value={scores[w] ?? 0}
                  onChange={v => setScores(prev => ({ ...prev, [w]: v }))}
                  steps={[-10000, -1000, -100, 100, 1000, 10000]}
                />
              ))}
              <ScoreInputRow
                label="供託"
                isSelf={false}
                value={scores.kyotaku ?? 0}
                onChange={v => setScores(prev => ({ ...prev, kyotaku: v }))}
                steps={[-1000, 1000]}
              />
            </>
          )}
        <div className="score-edit-footer">
          <span className={`score-edit-total${totalOk ? '' : ' score-edit-total--warn'}`}>
            {totalOk
              ? `合計 ${total.toLocaleString()}点（供託込み） ✓`
              : `⚠ 合計 ${total.toLocaleString()}点（供託込み）— 100,000点になっていません`}
          </span>
          <button className="dora-clear" onClick={() => setScores({ ...DEFAULT_SCORES })}>
            全員25000に戻す
          </button>
        </div>
      </div>
    </div>
  )
}
