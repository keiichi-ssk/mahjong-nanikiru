// 清一色トレーニングの出題中の1問（手牌と選択状態）の sessionStorage 保存。
// リロードしても同じ手牌が続くようにする（回答結果・成績は保存しない）。
// 復習用の誤答リストは永続化しない（直前のタイムアタックのセッション内メモリのみ・
// ChinitsuTimeAttack → ChinitsuDrill → ChinitsuTrainer で手牌配列を受け渡す方式）。

const ROUND_KEY = 'chinitsuRound';

export function saveChinitsuRound({ hand, discardedIndex, selectedWaits }) {
  sessionStorage.setItem(ROUND_KEY, JSON.stringify({
    hand,
    discardedIndex,
    selectedWaits: [...selectedWaits],
  }));
}

// 保存が無い・壊れている場合は null（呼び出し側が新規生成する）
export function loadChinitsuRound() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ROUND_KEY));
    if (!parsed || !Array.isArray(parsed.hand) || parsed.hand.length !== 14) return null;
    return {
      hand: parsed.hand,
      discardedIndex: typeof parsed.discardedIndex === 'number' ? parsed.discardedIndex : null,
      selectedWaits: new Set(Array.isArray(parsed.selectedWaits) ? parsed.selectedWaits : []),
    };
  } catch {
    return null;
  }
}
