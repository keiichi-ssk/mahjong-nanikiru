// デイリーランキングの一覧表示（表示専用・状態は親が持つ）。
// 今日（JST）のトップN件を「順位・名前・正解数」で並べる。自分の登録行は highlightId でハイライトする。
// 同点は同順位（rankForScore と同じ考え方）で連番表示する。

const ANON_NAME = 'ななし';

export default function ChinitsuLeaderboard({ entries, highlightId, loading, error }) {
  if (loading) {
    return <p className="chinitsu-lb-status">ランキングを読み込み中…</p>;
  }
  if (error) {
    return <p className="chinitsu-lb-status chinitsu-lb-status--error">ランキングを取得できませんでした。</p>;
  }
  if (!entries || entries.length === 0) {
    return <p className="chinitsu-lb-status">まだ今日の記録がありません。最初の1人になろう！</p>;
  }

  // 同点は同順位にする（score 降順ソート済みが前提）。順位はJSXの外で先に計算する
  const ranks = [];
  let prevScore = null;
  let prevRank = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const rank = entries[i].score === prevScore ? prevRank : i + 1;
    ranks.push(rank);
    prevScore = entries[i].score;
    prevRank = rank;
  }

  return (
    <ol className="chinitsu-lb-list">
      {entries.map((e, i) => {
        const rank = ranks[i];
        const isMe = highlightId != null && e.id === highlightId;
        return (
          <li
            key={e.id ?? i}
            className={`chinitsu-lb-row${isMe ? ' chinitsu-lb-row--me' : ''}`}
          >
            <span className={`chinitsu-lb-rank chinitsu-lb-rank--${rank <= 3 ? rank : 'n'}`}>
              {rank}
            </span>
            <span className="chinitsu-lb-name">
              {e.name || ANON_NAME}
              {isMe && <span className="chinitsu-lb-me-badge">あなた</span>}
            </span>
            <span className="chinitsu-lb-score">
              {e.score}<span className="chinitsu-lb-score-unit">問</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
