// 出題画面で問題をどう見せるかの判定（純粋関数・DOM/React 非依存）。
// ProblemView にベタ書きすると条件が散らばるので、ここに集約する。

/**
 * 麻雀卓の形（BoardView）で出題するか。
 *
 * 判定の材料は2つだけ:
 *   - 自作問題（my問題集）… 作問画面が盤面なので、出題も同じ見え方に揃える
 *   - 公式問題 … 管理画面の「盤面で出題」（problems.board_view）を立てた問題だけ
 *
 * 盤面には局・巡目・ドラ・点数・各家の河が含まれるため、
 * 卓を出すときは従来のヘッダー表示（problem-info-row / ScoreDisplay / 他家の捨て牌）を出さない。
 * どちらを出すかが1箇所で決まるよう、判定はこの関数だけが持つこと。
 */
export function usesBoardView(problem) {
  if (!problem) return false;
  return !!(problem.isUserProblem || problem.boardView);
}

/**
 * 出題時にスーツ（m/p/s）をランダムに入れ替えるか。
 *
 * 置換するのは公式問題だけ。次の3つは置換しない:
 *   - 自作問題（my問題集）… **実戦の局面を切り取って議論するためのもの**なので、
 *     元の牌姿からずらしてはいけない（2026-07-29 追加）。Xでの共有も同じ理由で置換しない
 *     —— ProblemView は置換後の問題をそのまま共有するので、ここを false にすれば
 *     出題画面・シェア・共有ページ（share.html）・OGPカードの牌姿が一致する
 *   - 問題画像付き … 画像の中の牌と食い違うため
 *   - 旧 image-quiz … 同上（DB移行済み。未移行データの保険）
 *
 * 公式問題（書籍の問題）は暗記防止が目的なので置換を続ける。
 * **判定はこの関数だけが持つこと**（ProblemView に条件を書き戻さない）。
 */
export function usesSuitRemap(problem) {
  if (!problem) return false;
  if (problem.isUserProblem) return false;
  if (problem.questionImageUrl) return false;
  if ((problem.problemType ?? 'default') === 'image-quiz') return false;
  return true;
}
