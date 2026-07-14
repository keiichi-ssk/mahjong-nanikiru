// 正誤判定ロジック（ProblemView.jsx から分離した純粋関数群）。
// UIに依存しないためユニットテスト可能。仕様は CLAUDE.md「問題タイプ（problem_type）」を参照。

// image-quiz と未設定（null/undefined/''）は default と同じ判定を使う
export function normalizeProblemType(problemType) {
  return (problemType === 'image-quiz' || !problemType) ? 'default' : problemType;
}

// answer はカンマ区切りで複数正解を持てる（例 "3m,6m"、"3m,ankan:5p"）。
// 単一正解・空文字・null もこの関数で配列に正規化する
export function parseAnswers(answer) {
  if (typeof answer !== 'string') return [];
  return answer.split(',').map(s => s.trim()).filter(Boolean);
}

// リーチ判断問題か。'1_リーチ判断' との section 比較は旧形式データとの互換用
export function isRiichiJudgmentProblem(problem) {
  const type = normalizeProblemType(problem.problemType);
  return type === 'riichi-judgment' || (type === 'default' && problem.section === '1_リーチ判断');
}

// default / image-quiz / riichi-judgment の正誤判定。
// selectedRiichi はリーチボタン未押しなら null（riichi: false と同等に扱う）
export function judgeAnswer(problem, { selected, selectedRiichi = null }) {
  if (isRiichiJudgmentProblem(problem)) {
    return selectedRiichi === problem.riichi;
  }
  const needsRiichi = problem.riichi !== null && problem.riichi !== undefined;
  return parseAnswers(problem.answer).includes(selected)
    && (!needsRiichi || (selectedRiichi ?? false) === problem.riichi);
}

// naki-timing: early / mid / late / no の一致
export function judgeNakiTiming(problem, selected) {
  return selected === problem.answer;
}

// naki-choice: correct フラグ付き牌の集合と選択集合の完全一致。
// selectedTiles は Set でも配列でもよい
export function judgeNakiChoice(nakiChoices, selectedTiles) {
  const correctTiles = new Set((nakiChoices ?? []).filter(c => c.correct).map(c => c.tile));
  const selected = selectedTiles instanceof Set ? selectedTiles : new Set(selectedTiles);
  return selected.size === correctTiles.size && [...selected].every(t => correctTiles.has(t));
}
