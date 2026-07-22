// 手牌を受け取り、OGPカード画像（1200×630 PNG）をその場で生成する共通ロジック。
// satori（要素ツリー→SVG）+ @resvg/resvg-js（SVG→PNG）を使用。ヘッドレスブラウザ不要で
// Vercel Serverless Function（Node runtime）上でも軽量に動く。api/og.js から呼ばれる。
//
// フォントは Noto Sans CJK JP（OFLライセンス）を、カードで実際に使う文字だけに
// fonttools でサブセット化して assets/fonts に同梱している（Bold/Regular 各12KB程度）。
// 元のCJK全域フォントは1書体17MBあり、Vercel関数の同梱サイズ上限に抵触するため必須の対応。
// カードの文言を変更する場合は、対象文字を増やして再度サブセット化すること
// （fonttools: `python -m fontTools.subset <元フォント> --text="使う文字列" --output-file=...`）。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { getTileImageUrl } from '../../src/utils/tileUtils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FONT_DIR = path.join(ROOT, 'assets/fonts');
const TILES_DIR = path.join(ROOT, 'public/tiles');

const fontCache = {};
function loadFont(weightName) {
  if (!fontCache[weightName]) {
    fontCache[weightName] = readFileSync(path.join(FONT_DIR, `NotoSansJP-${weightName}.otf`));
  }
  return fontCache[weightName];
}

const tileImageCache = new Map();
function tileDataUri(tile) {
  if (tileImageCache.has(tile)) return tileImageCache.get(tile);
  const fileName = path.basename(getTileImageUrl(tile));
  const svg = readFileSync(path.join(TILES_DIR, fileName));
  const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  tileImageCache.set(tile, uri);
  return uri;
}

function tileNode(tile) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 72, height: 100,
        background: 'linear-gradient(160deg, #ffffff 0%, #f0efec 100%)',
        border: '3px solid #b8c0cc', borderRadius: 9,
      },
      children: {
        type: 'img',
        props: { src: tileDataUri(tile), width: 58, height: 84 },
      },
    },
  };
}

function cardElement(hand) {
  return {
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
        { type: 'div', props: { style: { display: 'flex', gap: 7 }, children: hand.map(tileNode) } },
        { type: 'div', props: { style: { fontSize: 40, fontWeight: 700, color: '#88c0d0', display: 'flex' }, children: '何を切って何待ち？' } },
      ],
    },
  };
}

// hand: 牌コード14枚の配列。同一スーツのメンチン手牌を想定
export async function renderHandOgPng(hand) {
  const svg = await satori(cardElement(hand), {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Noto Sans JP', data: loadFont('Regular'), weight: 400, style: 'normal' },
      { name: 'Noto Sans JP', data: loadFont('Bold'), weight: 700, style: 'normal' },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  return resvg.render().asPng();
}
