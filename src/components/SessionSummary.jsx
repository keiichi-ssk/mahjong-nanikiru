import { sectionLabel } from '../utils/categoryUtils';

// ラウンド終了時の結果サマリー。
// roundResults は今ラウンドの正誤（未回答の問題はキーなし）
export default function SessionSummary({ problems, roundResults, onRetryWrong, onBack }) {
  const answered = problems.filter(p => roundResults[p.id] !== undefined);
  const correct = problems.filter(p => roundResults[p.id] === true);
  const wrong = problems.filter(p => roundResults[p.id] === false);
  const unanswered = problems.length - answered.length;
  const pct = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0;

  return (
    <div className="session-summary">
      <h2 className="session-summary-title">結果</h2>

      <div className="session-summary-score">
        <span className="session-summary-correct">{correct.length}</span>
        <span className="session-summary-total">/ {answered.length}問正解（{pct}%）</span>
      </div>

      <div className="session-summary-bar">
        <div className="session-summary-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {unanswered > 0 && (
        <p className="session-summary-note">未回答: {unanswered}問</p>
      )}

      {wrong.length === 0 && answered.length > 0 && (
        <p className="session-summary-perfect">全問正解！</p>
      )}

      {wrong.length > 0 && (
        <div className="session-summary-wrong">
          <h3 className="session-summary-wrong-title">間違えた問題（{wrong.length}問）</h3>
          <ul className="session-summary-wrong-list">
            {wrong.map(p => (
              <li key={p.id}>
                {sectionLabel(p.section)}
                <span className="session-summary-wrong-id"> #{p.id}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="session-summary-actions">
        {wrong.length > 0 && (
          <button className="btn-retry-wrong" onClick={onRetryWrong}>
            間違えた問題だけもう一度（{wrong.length}問）
          </button>
        )}
        <button className="btn-back-to-categories" onClick={onBack}>
          カテゴリへ戻る
        </button>
      </div>
    </div>
  );
}
