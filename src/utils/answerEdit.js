import { parseAnswers } from './judgeUtils';

// 正解（answer）の編集ヘルパー（管理画面・作問画面から使う純粋関数）。
//
// 手牌を丸ごと入れ替えると、前の手牌の正解が取り残されることがある
// （新規問題は手牌と正解を前の問題から引き継ぐため、特に起きやすい）。
// 取り残された正解は
//   ・出題画面で選べない＝絶対に正解できない問題になる
//   ・管理画面の正解牌リストは手牌から描かれるので、クリックで解除できない
// ため、手牌を差し替えたら必ず pruneAnswers() を通すこと。
// ※ 判定はここに集約する。ProblemEditor に書き戻さないこと

const TILE_RE  = /^[0-9][mpsz]$/;
const ANKAN_RE = /^ankan:([0-9][mpsz])$/;

// 暗槓は同じ牌が4枚そろっているときだけ成立する
// （管理画面のカンボタンも手牌に4枚ある牌にしか出ない）
const ANKAN_TILE_COUNT = 4;

// その正解トークンを今の手牌のまま残してよいか。
// 牌コードでないトークン（鳴きタイミングの early/mid/late/no など）は
// 手牌と関係が無いので常に残す
export function keepAnswerToken(token, tiles = []) {
  const ankan = ANKAN_RE.exec(token);
  if (ankan) return tiles.filter(t => t === ankan[1]).length >= ANKAN_TILE_COUNT;
  if (TILE_RE.test(token)) return tiles.includes(token);
  return true;
}

// 手牌に無い牌の正解を落とす。複数正解・ベタオリの順序はそのまま保つ
export function pruneAnswers(answer, tiles = []) {
  return parseAnswers(answer)
    .filter(token => keepAnswerToken(token, tiles))
    .join(',');
}
