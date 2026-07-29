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
