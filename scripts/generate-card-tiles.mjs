// OGPカード（api/og-problem.js）が使う牌画像を作る。
//
// ★ なぜ要るのか
//   アプリ本体が使う public/tiles/*.svg は1枚が最大60KBある詳細な図で、
//   satori/resvg は**牌の種類ごとに**これを解析・ラスタライズする。
//   本番の実測では1種類あたり約95msかかり、23種類のカードで描画に3.7秒を要していた
//   （素材の取得は並列に効いていて0.05〜0.7秒しかかかっていない＝取得はボトルネックではない）。
//   カード上では最大でも 24×35px にしか描かれないので、あらかじめラスタライズしておく。
//
// ★ 出力は public/tiles/card/*.png（48×70。カード上の最大サイズ 24×35 の2倍）。
//   **牌のSVGを描き替えたら、このスクリプトを実行して作り直すこと。**
//
// 使い方: node scripts/generate-card-tiles.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ImageResponse } from '@vercel/og';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(ROOT, 'public/tiles');
const OUT  = join(SRC, 'card');

// カード上の最大サイズは手牌の 24×35（tileNode が牌の枠から6px引いた値）。
// 高解像度で見ても粗くならないよう2倍で作る
const W = 48;
const H = 70;

mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter(f => f.endsWith('.svg'));
if (files.length === 0) throw new Error(`牌のSVGが見つかりません: ${SRC}`);

let svgTotal = 0;
let pngTotal = 0;

for (const file of files) {
  const svg = readFileSync(join(SRC, file), 'utf8');
  svgTotal += statSync(join(SRC, file)).size;

  const res = new ImageResponse(
    {
      type: 'div',
      props: {
        style: { display: 'flex', width: W, height: H },
        children: {
          type: 'img',
          props: { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, width: W, height: H },
        },
      },
    },
    { width: W, height: H },
  );

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(OUT, file.replace(/\.svg$/, '.png')), buf);
  pngTotal += buf.length;
}

const kb = n => `${(n / 1024).toFixed(0)}KB`;
console.log(`${files.length}枚を ${W}×${H} のPNGにしました → public/tiles/card/`);
console.log(`合計 ${kb(svgTotal)} → ${kb(pngTotal)}（1枚あたり ${kb(svgTotal / files.length)} → ${kb(pngTotal / files.length)}）`);
