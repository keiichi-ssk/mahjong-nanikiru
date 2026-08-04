import { getTileImageUrl, getTileLabel } from '../utils/tileUtils';

// 「みんなの選択」の1行ぶん。暗槓（ankan:5m）は牌＋ラベルで表す
function AnswerLabel({ answer }) {
  const isAnkan = answer.startsWith('ankan:');
  const tile = isAnkan ? answer.slice(6) : answer;
  const url = getTileImageUrl(tile);
  return (
    <span className="tally-label">
      {url
        ? <img className="tally-tile" src={url} alt={getTileLabel(tile)} />
        : <span className="tally-tile-fallback">{tile}</span>}
      {isAnkan && <span className="tally-ankan">暗槓</span>}
    </span>
  );
}

/**
 * 共有された問題の「みんなの選択」。回答したあとにだけ表示する。
 *
 * ★ 1人目から出す（ユーザー判断・2026-08-04）。ただし **必ず回答者数を併記する**こと。
 *   「100%」だけを見せると、1人しか答えていないのに総意のように見える。
 * ★ 並び順は多い順。**正解を強調しない**（ここは「他の人がどう考えたか」を見せる場所で、
 *   正誤は ProblemView の解答パネルが担当する）。
 */
export default function AnswerTally({ tally, total, myAnswer }) {
  if (!tally || !total) return null;

  const rows = Object.entries(tally)
    .map(([answer, count]) => ({ answer, count: Number(count) || 0 }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer));

  if (rows.length === 0) return null;

  return (
    <section className="answer-tally">
      <div className="answer-tally-head">
        <h2>みんなの選択</h2>
        <span className="answer-tally-total">{total}人が回答</span>
      </div>
      <ul className="answer-tally-list">
        {rows.map(({ answer, count }) => {
          const pct = Math.round((count / total) * 100);
          const mine = answer === myAnswer;
          return (
            <li key={answer} className={mine ? 'answer-tally-row is-mine' : 'answer-tally-row'}>
              <AnswerLabel answer={answer} />
              {/* 棒の長さは割合。数値も併記するので、棒だけで読ませない */}
              <span className="tally-bar" aria-hidden="true">
                <span className="tally-bar-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="tally-pct">{pct}%</span>
              <span className="tally-count">{count}人</span>
              {mine && <span className="tally-mine-mark">あなた</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
