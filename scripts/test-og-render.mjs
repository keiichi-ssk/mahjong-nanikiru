// api/_lib/og-render.js の描画結果をローカルで目視確認するための検証スクリプト。
// Vercel Serverless Function はローカルのVite devでは動かせないため、
// 本番pushの前にレンダリングロジック自体（satori+resvg+フォント+牌画像）が正しく動くかをここで確認する。
// 実行: node scripts/test-og-render.mjs
// 出力: scripts/tweet-drafts-out/og-test.png

import { register } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

register('./esm-resolve-js-loader.mjs', import.meta.url);

const { renderHandOgPng } = await import('../api/_lib/og-render.js');

const sampleHand = ['1p', '1p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '7p', '7p', '8p', '9p', '9p'];

const png = await renderHandOgPng(sampleHand);

const outDir = path.resolve('scripts/tweet-drafts-out');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'og-test.png');
writeFileSync(outPath, png);

console.log(`generated: ${outPath}`);
