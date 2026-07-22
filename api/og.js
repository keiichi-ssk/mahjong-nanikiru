// 手牌ごとのOGPカード画像を返すエンドポイント（/api/og?q=牌14桁+スーツ）。
// api/share.js の og:image から参照される。q が無い/不正な場合は代表例の手牌にフォールバックする。
//
// Edge Runtime + @vercel/og を使用（satori + resvg-wasm を内蔵。ネイティブバイナリ不要）。
// 当初は素の satori + @resvg/resvg-js（Node runtime）で実装したが、Vercelの関数バンドルに
// ネイティブ .node バイナリが正しく含まれず本番で常時 FUNCTION_INVOCATION_FAILED になったため、
// Vercel公式のこの構成に置き換えた（2026-07-22）。
// Edge Runtime には Node の fs が無いため、フォント・牌画像はいずれも fetch で取得する
// （フォントは public/fonts/、牌画像は public/tiles/ に置いてあり静的配信されている）。

import { ImageResponse } from '@vercel/og';
import { decodeHandParam } from '../src/utils/chinitsuShare.js';
import { getTileImageUrl } from '../src/utils/tileUtils.js';

export const config = { runtime: 'edge' };

const FALLBACK_HAND = ['1p', '1p', '2p', '3p', '4p', '5p', '5p', '6p', '7p', '8p', '9p', '9p', '9p', '9p'];

// SVGはテキストなのでURLエンコードしたdata URIにする（Bufferを使わずEdge Runtimeで完結させる）
async function tileDataUri(origin, tile) {
  const res = await fetch(new URL(getTileImageUrl(tile), origin));
  const svgText = await res.text();
  return `data:image/svg+xml,${encodeURIComponent(svgText)}`;
}

function tileNode(src) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 72, height: 100,
        background: 'linear-gradient(160deg, #ffffff 0%, #f0efec 100%)',
        border: '3px solid #b8c0cc', borderRadius: 9,
      },
      children: { type: 'img', props: { src, width: 58, height: 84 } },
    },
  };
}

export default async function handler(req) {
  const { origin, searchParams } = new URL(req.url);
  const hand = decodeHandParam(searchParams.get('q')) ?? FALLBACK_HAND;

  const [tileUris, fontRegular, fontBold] = await Promise.all([
    Promise.all(hand.map(t => tileDataUri(origin, t))),
    fetch(new URL('/fonts/NotoSansJP-Regular.otf', origin)).then(r => r.arrayBuffer()),
    fetch(new URL('/fonts/NotoSansJP-Bold.otf', origin)).then(r => r.arrayBuffer()),
  ]);

  const image = new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: 1200, height: 630, position: 'relative',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 34,
          background: 'linear-gradient(160deg, #2e3440 0%, #3b4252 70%, #434c5e 100%)',
        },
        children: [
          { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: '#88c0d0', display: 'flex' } } },
          { type: 'div', props: { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: '#88c0d0', display: 'flex' } } },
          { type: 'div', props: { style: { fontSize: 82, fontWeight: 700, color: '#eceff4', display: 'flex' }, children: 'メンチン何切るドリル' } },
          { type: 'div', props: { style: { fontSize: 30, color: '#9fadbf', display: 'flex' }, children: '清一色の何切るを特訓' } },
          { type: 'div', props: { style: { display: 'flex', gap: 7 }, children: tileUris.map(tileNode) } },
          { type: 'div', props: { style: { fontSize: 40, fontWeight: 700, color: '#88c0d0', display: 'flex' }, children: '何を切って何待ち？' } },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Noto Sans JP', data: fontRegular, weight: 400, style: 'normal' },
        { name: 'Noto Sans JP', data: fontBold, weight: 700, style: 'normal' },
      ],
    },
  );
  // 同じ q なら常に同じ画像になるため長期キャッシュしてよい
  image.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return image;
}
