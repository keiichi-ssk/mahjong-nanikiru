// 出題ラウンド（出題開始〜カテゴリへ戻る）の進行状態を sessionStorage に保存する。
// リロードや「前の問題」で戻ったときの復元に使う。
// 保存キーの追加・変更は必ずこのファイルだけで行うこと（App.jsx にキー名を書かない）。

const KEYS = {
  isPlaying:           'isPlaying',
  orderedIds:          'orderedIds',
  currentIndex:        'currentIndex',
  roundResults:        'roundResults',
  roundAnswers:        'roundAnswers',
  sessionFirstResults: 'sessionFirstResults',
  // ラウンド開始時点の DB 正誤スナップショット。「過去に不正解だった問題を今回正解した」
  // 保留判定の基準に使う（リロードしても保留判定を維持するため保存する）
  sessionStartResults: 'sessionStartResults',
  showSummary:         'showSummary',
};

// 清一色トレーニング画面に居るかどうか。出題ラウンドとは別軸のため KEYS には含めず、
// clearRound()（カテゴリへ戻るとき全消去）の対象にしない
const CHINITSU_MODE_KEY = 'chinitsuMode';

export function saveChinitsuMode(on) {
  if (on) sessionStorage.setItem(CHINITSU_MODE_KEY, 'true');
  else sessionStorage.removeItem(CHINITSU_MODE_KEY);
}

export function loadChinitsuMode() {
  return sessionStorage.getItem(CHINITSU_MODE_KEY) === 'true';
}

function parseJson(json, fallback) {
  try {
    return JSON.parse(json) ?? fallback;
  } catch {
    return fallback;
  }
}

// 同一セッション内の再ラウンド（間違えた問題の再挑戦）。
// sessionFirstResults（DB記録済みの1度目の正誤）は保持する
export function saveRoundRetry(orderedIds) {
  sessionStorage.setItem(KEYS.orderedIds, JSON.stringify(orderedIds));
  sessionStorage.setItem(KEYS.currentIndex, '0');
  sessionStorage.setItem(KEYS.roundResults, '{}');
  sessionStorage.setItem(KEYS.roundAnswers, '{}');
  sessionStorage.removeItem(KEYS.showSummary);
}

// 新しい出題セッションの開始（1度目の正誤もリセット）
export function saveRoundStart(orderedIds) {
  sessionStorage.setItem(KEYS.isPlaying, 'true');
  saveRoundRetry(orderedIds);
  sessionStorage.setItem(KEYS.sessionFirstResults, '{}');
}

// カテゴリ画面へ戻るとき全消去
export function clearRound() {
  Object.values(KEYS).forEach(k => sessionStorage.removeItem(k));
}

export function saveCurrentIndex(index) {
  sessionStorage.setItem(KEYS.currentIndex, String(index));
}

export function saveRoundResults(results) {
  sessionStorage.setItem(KEYS.roundResults, JSON.stringify(results));
}

export function saveRoundAnswers(answers) {
  sessionStorage.setItem(KEYS.roundAnswers, JSON.stringify(answers));
}

export function saveSessionFirstResults(results) {
  sessionStorage.setItem(KEYS.sessionFirstResults, JSON.stringify(results));
}

// ラウンド開始時の DB 正誤スナップショットを保存する。
// 同一セッション内の再ラウンド（retryWrong）では保持され、新規出題（startSelected）で上書きする
export function saveSessionStartResults(snapshot) {
  sessionStorage.setItem(KEYS.sessionStartResults, JSON.stringify(snapshot));
}

export function saveShowSummary(show) {
  if (show) sessionStorage.setItem(KEYS.showSummary, 'true');
  else sessionStorage.removeItem(KEYS.showSummary);
}

// 保存済みのラウンド状態を読み出す（値が壊れていても安全なデフォルトを返す）
export function loadRound() {
  return {
    isPlaying:           sessionStorage.getItem(KEYS.isPlaying) === 'true',
    orderedIds:          parseJson(sessionStorage.getItem(KEYS.orderedIds), []),
    currentIndex:        parseInt(sessionStorage.getItem(KEYS.currentIndex) ?? '0', 10) || 0,
    roundResults:        parseJson(sessionStorage.getItem(KEYS.roundResults), {}),
    roundAnswers:        parseJson(sessionStorage.getItem(KEYS.roundAnswers), {}),
    sessionFirstResults: parseJson(sessionStorage.getItem(KEYS.sessionFirstResults), {}),
    sessionStartResults: parseJson(sessionStorage.getItem(KEYS.sessionStartResults), {}),
    showSummary:         sessionStorage.getItem(KEYS.showSummary) === 'true',
  };
}
