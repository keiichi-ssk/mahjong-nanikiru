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

// 手牌を根拠に正解を検査してよいか。
// ★ 手牌が空の問題（画像だけの問題）では検査しない（2026-08-06）。
//   正解は牌パレットから直接付けるので、手牌に無いことが正常な状態になる。
//   ここで検査すると、付けた正解が消えたり全部が警告表示になったりする
function checkable(tiles) {
  return (tiles ?? []).length > 0;
}

// 「手牌にあるはずなのに無い」正解か（作問画面が警告表示に使う）
export function isOrphanAnswer(token, tiles = []) {
  if (!checkable(tiles)) return false;
  return !keepAnswerToken(token, tiles);
}

// 手牌に無い牌の正解を落とす。複数正解・ベタオリの順序はそのまま保つ
export function pruneAnswers(answer, tiles = []) {
  const list = parseAnswers(answer);
  if (!checkable(tiles)) return list.join(',');
  return list.filter(token => keepAnswerToken(token, tiles)).join(',');
}
