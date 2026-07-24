import { useState } from 'react';
import { sectionLabel } from '../utils/categoryUtils';

// ラウンド終了時の結果サマリー。
// roundResults は今ラウンドの正誤（未回答の問題はキーなし）
// pendingUpgradeProblems は「過去に不正解登録されていて今回正解した」問題（正解済みへ更新するか選ばせる対象）
export default function SessionSummary({
  problems, roundResults, pendingUpgradeProblems = [], onConfirmUpgrades, onRetryWrong, onBack,
}) {
  // null = 未選択, 'upgraded' = 正解済みにした, 'kept' = 不正解のまま残した
  const [upgradeDecision, setUpgradeDecision] = useState(null);
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

      {pendingUpgradeProblems.length > 0 && (
        <div className="session-summary-upgrade">
          <p className="session-summary-upgrade-text">
            以前まちがえた {pendingUpgradeProblems.length} 問に正解しました。正解済みに更新しますか？
          </p>
          {upgradeDecision === null ? (
            <div className="session-summary-upgrade-actions">
              <button
                className="btn-upgrade-confirm"
                onClick={() => {
                  onConfirmUpgrades(pendingUpgradeProblems.map(p => p.id));
                  setUpgradeDecision('upgraded');
                }}
              >
                正解済みにする
              </button>
              <button
                className="btn-upgrade-keep"
                onClick={() => setUpgradeDecision('kept')}
              >
                不正解のまま残す
              </button>
            </div>
          ) : (
            <p className="session-summary-upgrade-done">
              {upgradeDecision === 'upgraded'
                ? `✓ ${pendingUpgradeProblems.length}問を正解済みにしました`
                : '不正解のまま残しました'}
            </p>
          )}
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
