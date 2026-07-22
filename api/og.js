// 手牌ごとのOGPカード画像を返すエンドポイント（/api/og?q=牌14桁+スーツ）。
// api/share.js の og:image から参照される。q が無い/不正な場合は代表例の手牌にフォールバックする。

import { decodeHandParam } from '../src/utils/chinitsuShare.js';
import { renderHandOgPng } from './_lib/og-render';

const FALLBACK_HAND = ['1p', '1p', '2p', '3p', '4p', '5p', '5p', '6p', '7p', '8p', '9p', '9p', '9p', '9p'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const hand = decodeHandParam(req.query.q) ?? FALLBACK_HAND;

  try {
    const png = await renderHandOgPng(hand);
    res.setHeader('Content-Type', 'image/png');
    // 同じ q なら常に同じ画像になるため長期キャッシュしてよい
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(png);
  } catch (err) {
    console.error('og image render failed', err);
    return res.status(500).end();
  }
}
