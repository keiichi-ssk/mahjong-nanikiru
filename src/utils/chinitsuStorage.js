// 清一色トレーニングで間違えた手牌を localStorage に保存し、後から復習できるようにする。
// 保存するのは手牌14枚の配列のみ（正誤の再判定は chinitsuUtils.js の純粋関数で毎回やり直せるため）。
// ブラウザを閉じても残るが、端末・ブラウザをまたいでは共有されない。

const STORAGE_KEY = 'chinitsuMissedProblems';
const MAX_ENTRIES = 50;

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
