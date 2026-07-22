// X（旧Twitter）プロフィールアイコン（400×400 PNG）を生成するスクリプト。
// デザイン: Nordダーク背景＋水色リング＋「座学(する)」「麻雀」の2段テキスト（2026-07-22 確定版）。
// 円形に切り抜かれる前提で、要素は中央の安全圏に収めている。
// 実行: node scripts/generate-x-icon.mjs → assets/x-icon.png（Web配信対象外のデザイン素材）

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('assets');

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 400px; height: 400px; background: #2e3440; }
  .bg {
    width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px;
    background: linear-gradient(160deg, #2e3440 0%, #3b4252 100%);
    box-shadow: inset 0 0 0 14px #88c0d0;
    border-radius: 50%;
  }
  .txt-main {
    font-family: "Yu Gothic UI", "Meiryo", sans-serif;
    font-size: 128px; font-weight: bold; color: #eceff4; line-height: 1.1;
    position: relative;
  }
  /* 「する」は絶対配置にして「座学」「麻雀」の中央寄せに影響させない */
  .txt-suru {
    font-size: 34px; color: #eceff4;
    position: absolute; right: -50px; bottom: 10px;
  }
  .txt-sub {
    font-family: "Yu Gothic UI", "Meiryo", sans-serif;
    font-size: 66px; font-weight: bold; color: #88c0d0; line-height: 1.1;
  }
</style></head>
<body>
  <div class="bg">
    <div class="txt-main">座学<span class="txt-suru">する</span></div>
    <div class="txt-sub">麻雀</div>
  </div>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
await page.setContent(HTML, { waitUntil: 'networkidle' });
const outPath = path.join(OUT_DIR, 'x-icon.png');
await page.screenshot({ path: outPath });
console.log(`generated: ${outPath}`);
await browser.close();
