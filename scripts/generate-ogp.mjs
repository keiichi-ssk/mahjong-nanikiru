// OGPカード画像（1200×630 PNG）を生成するスクリプト。
// 牌SVG（public/tiles）をdata URIで埋め込んだHTMLをPlaywright(Chromium)でスクリーンショットする。
// 実行: node scripts/generate-ogp.mjs → public/ogp.png（ドリル用）/ public/ogp-home.png（本体用）
// デザインを変えたらこのスクリプトを編集して再実行し、生成物をコミットする。

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TILES_DIR = path.resolve('public/tiles');
const OUT_DIR = path.resolve('public');

const TILE_NAME = {
  '1p': 'Pin1', '2p': 'Pin2', '3p': 'Pin3', '4p': 'Pin4', '5p': 'Pin5',
  '6p': 'Pin6', '7p': 'Pin7', '8p': 'Pin8', '9p': 'Pin9',
};

function tileImg(tile) {
  const svg = readFileSync(path.join(TILES_DIR, `${TILE_NAME[tile]}.svg`));
  const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  return `<span class="tile"><img src="${uri}" alt="${tile}" /></span>`;
}

// シェア例と同じ、単騎に見えて広い待ちが隠れている手牌（見栄え重視で筒子固定）
const HAND = ['1p', '1p', '2p', '3p', '4p', '5p', '5p', '6p', '7p', '8p', '9p', '9p', '9p', '9p'];

const CARDS = [
  {
    file: 'ogp.png',
    title: 'メンチン何切るドリル',
    subtitle: '清一色の何切るを特訓 ｜ 登録不要・スマホ対応',
    question: '何を切って何待ち？',
    tiles: HAND,
  },
  {
    file: 'ogp-home.png',
    title: '座学する麻雀',
    subtitle: '麻雀の「何切る」を体系的に学ぶ問題集アプリ',
    question: '',
    tiles: HAND,
  },
];

function cardHtml({ title, subtitle, question, tiles }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    background: linear-gradient(160deg, #2e3440 0%, #3b4252 70%, #434c5e 100%);
    font-family: "Yu Gothic UI", "Meiryo", sans-serif;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 34px;
    position: relative;
    overflow: hidden;
  }
  /* 上下のアクセントライン */
  body::before, body::after {
    content: ''; position: absolute; left: 0; right: 0; height: 10px;
    background: #88c0d0;
  }
  body::before { top: 0; }
  body::after { bottom: 0; }
  .title {
    font-size: 82px; font-weight: bold; color: #eceff4;
    letter-spacing: 2px;
    text-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
  }
  .subtitle { font-size: 30px; color: #9fadbf; }
  .tiles { display: flex; gap: 7px; }
  .tile {
    display: flex; align-items: center; justify-content: center;
    width: 72px; height: 100px;
    background: linear-gradient(160deg, #ffffff 0%, #f0efec 100%);
    border: 3px solid #b8c0cc; border-radius: 9px;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
  }
  .tile img { width: 58px; height: 84px; object-fit: contain; }
  .question { font-size: 40px; font-weight: bold; color: #88c0d0; }
</style></head>
<body>
  <div class="title">${title}</div>
  <div class="subtitle">${subtitle}</div>
  <div class="tiles">${tiles.map(tileImg).join('')}</div>
  ${question ? `<div class="question">${question}</div>` : ''}
</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

for (const card of CARDS) {
  await page.setContent(cardHtml(card), { waitUntil: 'networkidle' });
  const outPath = path.join(OUT_DIR, card.file);
  await page.screenshot({ path: outPath });
  console.log(`generated: ${outPath}`);
}

await browser.close();
