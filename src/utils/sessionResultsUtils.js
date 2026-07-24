// 出題ラウンドの正誤記録に関する純粋関数（DB非依存・DOM非依存）。
// 「過去に不正解登録されている問題を今回正解したとき、DBへの更新をサマリーでの
// 選択まで保留する」仕様の判定をここに集約する（コンポーネントに書き戻さない）。
//
// - startSnapshot: ラウンド開始時点の DB 正誤マップ（{ [problemId]: true|false }）。
//   キーは problemId の文字列、値は correct。未登録の問題はキーが存在しない
// - sessionFirstResults: 今セッションで最初に回答したときの正誤（{ [problemId]: true|false }）

// この初回回答を即時に記録せず保留すべきか。
// 「開始時点で不正解(false)」かつ「今回正解(true)」のときだけ true。
export function shouldDeferResult(startSnapshot, problemId, isCorrect) {
  return isCorrect === true && startSnapshot?.[problemId] === false;
}

// 保留対象（過去に不正解登録されていて今回正解した問題）の problemId 一覧を導出する。
// 返すキーは startSnapshot / sessionFirstResults と同じ文字列キー。
export function collectPendingUpgrades(startSnapshot, sessionFirstResults) {
  if (!sessionFirstResults) return [];
  return Object.keys(sessionFirstResults).filter(
    id => sessionFirstResults[id] === true && startSnapshot?.[id] === false
  );
}
