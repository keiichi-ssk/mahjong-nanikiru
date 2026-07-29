// 共有された自作問題のOGPカード画像（/api/og-problem?p=圧縮した問題）。
// api/share-q.js の og:image から参照される。p が無い／壊れている場合は手牌なしのカードになる。
//
// 構成は api/og.js（メンチンドリル用）と同じ。Edge Runtime + @vercel/og。
// Edge Runtime には Node の fs が無いため、フォント・牌画像はいずれも fetch で取得する。
//
// ★★ 文言を増やすときはフォントのサブセットを作り直すこと ★★
//   public/fonts/NotoSansJP-{Bold,Regular}.otf はカードで使う文字だけに絞ってある
//   （全字体は1書体17MBで、Vercel関数の同梱サイズ上限に触れる）。
//   現在含まれているのは次の32字だけで、これ以外を書くと豆腐（□）になる:
//     0123456789ちってのるをチドメリルン一何切待清特色訓？
//   そのため **局・巡目・タイトルはカードに載せていない**（「東」「局」「巡目」が無く、
//   タイトルは共有元の自由入力なのでどんな文字が来るか分からない）。
//   卓の絵や状況表示を足すときは fonttools で対象文字を増やしてからにすること。

import { ImageResponse } from '@vercel/og';
import { decodeProblemParam } from '../src/utils/problemShare.js';
import { getTileImageUrl } from '../src/utils/tileUtils.js';

export const config = { runtime: 'edge' };

// 手牌が無い（壊れたリンク）ときに出す代表例
const FALLBACK_HAND = ['1m', '2m', '3m', '4p', '5p', '6p', '7s', '8s', '9s', '1z', '1z', '5z', '5z', '9m'];

// SVGはテキストなのでURLエンコードしたdata URIにする（Bufferを使わずEdge Runtimeで完結させる）
async function tileDataUri(origin, tile) {
  const url = getTileImageUrl(tile);
  if (!url) return null;
  const res = await fetch(new URL(url, origin));
  const svgText = await res.text();
  return `data:image/svg+xml,${encodeURIComponent(svgText)}`;
}

// 手牌は最大14枚。副露があると手牌は短くなるが、カードには手牌だけを出す
// （副露まで並べると1枚あたりが小さくなり、何の牌か読めなくなるため）
function tileNode(src, size) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: size.w, height: size.h,
        background: 'linear-gradient(160deg, #ffffff 0%, #f0efec 100%)',
        border: '3px solid #b8c0cc', borderRadius: 9,
      },
      children: { type: 'img', props: { src, width: Math.round(size.w * 0.8), height: Math.round(size.h * 0.84) } },
    },
  };
}

export default async function handler(req) {
  const { origin, searchParams } = new URL(req.url);

  const problem = await decodeProblemParam(searchParams.get('p'));
  const hand = problem?.tiles?.length ? problem.tiles : FALLBACK_HAND;

  // 14枚でも横幅に収まるサイズ。枚数が少ないときは大きく見せる
  const size = hand.length > 12 ? { w: 72, h: 100 } : { w: 84, h: 116 };

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
          gap: 40,
          background: 'linear-gradient(160deg, #2e3440 0%, #3b4252 70%, #434c5e 100%)',
        },
        children: [
          { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: '#88c0d0', display: 'flex' } } },
          { type: 'div', props: { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: '#88c0d0', display: 'flex' } } },
          { type: 'div', props: { style: { fontSize: 88, fontWeight: 700, color: '#eceff4', display: 'flex' }, children: '何切る' } },
          {
            type: 'div',
            props: {
              style: { display: 'flex', gap: 7 },
              children: tileUris.filter(Boolean).map(src => tileNode(src, size)),
            },
          },
          { type: 'div', props: { style: { fontSize: 44, fontWeight: 700, color: '#88c0d0', display: 'flex' }, children: '何を切る？' } },
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
  // 同じ p なら常に同じ画像になるため長期キャッシュしてよい
  image.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return image;
}
