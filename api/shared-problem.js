// 共有された自作問題の本体を返す（/api/shared-problem?t=<共有トークン>）。
// share.html（ShareApp）が fetch で呼ぶ。
//
// ★ ブラウザから直接 Supabase を引かないのは2つの理由から:
//   1. share.html に supabase-js（201KB）を持ち込みたくない（軽さがこのページの価値）
//   2. 「トークン一致の1行だけ」は RLS では安全に表現できない（_lib/sharedProblem.js のコメント参照）
//
// ⚠ この API はローカルの Vite 開発サーバーでは動かない。変更したら push して本番で確認すること。

import { fetchSharedProblem, isShareToken } from './_lib/sharedProblem.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const token = typeof req.query.t === 'string' ? req.query.t : '';
  if (!isShareToken(token)) {
    return res.status(400).json({ error: 'invalid token' });
  }

  const problem = await fetchSharedProblem(token);
  if (!problem) {
    return res.status(404).json({ error: 'not found' });
  }

  // ★ キャッシュしない。この方式の目的が「編集したら同じURLで最新が見える」ことなので、
  //   数十秒でも古い内容を返すと「直したのに反映されない」という混乱になる
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ problem });
}
