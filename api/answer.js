// 共有された問題への回答を記録し、更新後の集計を返す（/api/answer）。
// share.html（ShareApp）が回答時に呼ぶ。
//
// ★ 「開いたとき」ではなく「回答したとき」に集計を返す設計にしている。
//   先に渡すと、画面で隠しても開発者ツールで「みんなの答え」が見えてしまう。
//
// ★ version（問題の骨格のハッシュ）は **必ずサーバー側で計算する**。
//   クライアントの申告を信じると、古い集計に別の問題の回答を混ぜられる。
//
// ⚠ この API はローカルの Vite 開発サーバーでは動かない。変更したら push して本番で確認すること。

import { problemKey } from '../src/utils/problemKey.js';
import {
  fetchSharedProblemResult, bumpAnswerTally, fetchAnswerTally, isShareToken,
} from './_lib/sharedProblem.js';

// 集計するのは「何切る」だけ。リーチ判断・鳴き・ベタオリは回答の形が違う
const SUPPORTED_TYPE = 'default';

/**
 * 回答として受け付けてよい値か。
 * ★ 手牌にある牌（か、その暗槓）だけを通す。任意の文字列を通すと jsonb のキーが汚れる
 */
function isValidAnswer(problem, answer) {
  if (typeof answer !== 'string' || answer.length > 16) return false;
  const tiles = problem.tiles ?? [];
  if (answer.startsWith('ankan:')) return tiles.includes(answer.slice(6));
  return tiles.includes(answer);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { t, answer } = req.body ?? {};
  if (!isShareToken(t)) {
    return res.status(400).json({ error: 'invalid token' });
  }

  const { problem, reason } = await fetchSharedProblemResult(t);
  if (!problem) {
    return res.status(404).json({ error: 'not found', reason });
  }

  // 対象外の問題タイプは、エラーにせず「集計は無い」と伝える（画面側は何も出さない）
  if ((problem.problemType ?? SUPPORTED_TYPE) !== SUPPORTED_TYPE) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ tally: {}, total: 0, supported: false });
  }

  const version = await problemKey(problem);

  // answer が無いのは「すでに回答済みの人が開き直した」場合。数えずに集計だけ返す
  let result;
  if (answer == null) {
    result = await fetchAnswerTally(t, version);
  } else if (!isValidAnswer(problem, answer)) {
    return res.status(400).json({ error: 'invalid answer' });
  } else {
    result = await bumpAnswerTally(t, version, answer);
  }

  if (!result.tally) {
    return res.status(502).json({ error: 'failed', reason: result.reason });
  }

  const tally = result.tally;
  const total = Object.values(tally).reduce((sum, n) => sum + (Number(n) || 0), 0);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ tally, total, supported: true });
}
