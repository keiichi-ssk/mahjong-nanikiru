// 清一色トレーニングで間違えた手牌を localStorage に保存し、後から復習できるようにする。
// 保存するのは手牌14枚の配列のみ（正誤の再判定は chinitsuUtils.js の純粋関数で毎回やり直せるため）。
// ブラウザを閉じても残るが、端末・ブラウザをまたいでは共有されない。

const STORAGE_KEY = 'chinitsuMissedProblems';
const MAX_ENTRIES = 50;

// ===== 出題中の1問（手牌と選択状態）の sessionStorage 保存 =====
// リロードしても同じ手牌が続くようにする（回答結果・成績は保存しない）

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

export function loadMissedProblems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// 同じ手牌が既にあれば重複追加しない。上限を超えたら古いものから削除する
export function addMissedProblem(hand) {
  const list = loadMissedProblems();
  const key = JSON.stringify(hand);
  if (list.some(h => JSON.stringify(h) === key)) return;
  const next = [...list, hand];
  if (next.length > MAX_ENTRIES) next.splice(0, next.length - MAX_ENTRIES);
  save(next);
}

export function removeMissedProblem(hand) {
  const list = loadMissedProblems();
  const key = JSON.stringify(hand);
  save(list.filter(h => JSON.stringify(h) !== key));
}
