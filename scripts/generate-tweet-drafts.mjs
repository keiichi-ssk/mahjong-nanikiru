// X投稿の下書きを自動生成するスクリプト。
// メンチン何切るドリルの判定エンジン（chinitsuUtils.js）で大量の手牌をランダム生成し、
// 「受け入れが広い」「待ちが多面」といった映える問題を選んで、
// そのままコピペで使える投稿文＋シェアURLを出力する。自動投稿はしない（下書きのみ）。
// 手牌は文字表記だけだと分かりにくいため、実際の牌画像を並べたHTMLプレビューも生成しブラウザで開く。
// 実行: npm run tweet-drafts [件数（省略時5）]

import { register } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

// src/utils配下はViteの流儀で拡張子なしimportのため、Nodeから読めるようローダーを登録してから動的importする
register('./esm-resolve-js-loader.mjs', import.meta.url);

const { generateChinitsuHand, analyzeDiscard, isWinningHand } = await import('../src/utils/chinitsuUtils.js');
const { buildShareUrl } = await import('../src/utils/chinitsuShare.js');
const { getTileImageUrl } = await import('../src/utils/tileUtils.js');

const SAMPLE_SIZE = 20000;
const SUITS = ['m', 'p', 's'];
const OUT_DIR = path.resolve('scripts/tweet-drafts-out');
const TILES_DIR = path.resolve('public/tiles');
const MULTI_WAIT_MIN = 3; // これ未満（両面・シャンポン等）は「多面待ち」とみなさない

// 同じ受け入れ枚数の中で役の高いものだけに絞る（アプリの正誤判定と同じ絞り込み）
function topValueOf(tier) {
  const maxValue = Math.max(...tier.map(r => r.value));
  return tier.filter(r => r.value === maxValue);
}

// 面白さの基準: 「最善手」「次善手」の受け入れ枚数（2段階）がともに多面待ちになる手牌のみを対象にする
function scoreHand(hand) {
  if (isWinningHand(hand)) return null; // 既にアガリの形は「何切る」問題として成立しないため除外

  const candidates = [...new Set(hand)];
  const results = candidates
    .map(tile => ({ tile, ...analyzeDiscard(hand, tile) }))
    .filter(r => r.isTenpai);
  if (results.length === 0) return null;

  const ukeireLevels = [...new Set(results.map(r => r.ukeire))].sort((a, b) => b - a);
  if (ukeireLevels.length < 2) return null; // 次善手（2番目に受け入れが広い打牌）が存在しない

  const bestTier = topValueOf(results.filter(r => r.ukeire === ukeireLevels[0]));
  const secondTier = topValueOf(results.filter(r => r.ukeire === ukeireLevels[1]));
  const isMulti = (tier) => tier.every(r => r.waits.length >= MULTI_WAIT_MIN);
  if (!isMulti(bestTier) || !isMulti(secondTier)) return null;

  const waitKinds = new Set(bestTier.flatMap(r => r.waits)).size;
  return { hand, maxUkeire: ukeireLevels[0], waitKinds, score: ukeireLevels[0] * 10 + waitKinds };
}

// 手牌の形（スーツを無視した数字構成）が同じものは1件に絞り、似た問題が並ぶのを防ぐ
function shapeKey(hand) {
  return hand.map(t => t[0]).sort().join('');
}

function pickTopCandidates(count) {
  const candidates = [];
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const suit = SUITS[i % SUITS.length];
    const scored = scoreHand(generateChinitsuHand(suit));
    if (scored) candidates.push(scored);
  }
  candidates.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const top = [];
  for (const c of candidates) {
    const key = shapeKey(c.hand);
    if (seen.has(key)) continue;
    seen.add(key);
    top.push(c);
    if (top.length >= count) break;
  }
  return top;
}

function tileImgTag(tile) {
  const fileName = path.basename(getTileImageUrl(tile));
  const svg = readFileSync(path.join(TILES_DIR, fileName));
  const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  return `<span class="tile"><img src="${uri}" alt="${tile}" /></span>`;
}

function draftHtml(d, i, tweetText, problemUrl, intentUrl) {
  return `
    <section class="card">
      <h2>候補${i + 1}　受け入れ${d.maxUkeire}枚・${d.waitKinds}面待ち</h2>
      <div class="tiles">${d.hand.map(tileImgTag).join('')}</div>
      <pre class="tweet-text">${tweetText}</pre>
      <p class="problem-url">${problemUrl}</p>
      <a class="open-btn" href="${intentUrl}" target="_blank" rel="noopener noreferrer">この内容でX投稿画面を開く</a>
    </section>`;
}

function previewPageHtml(cardsHtml) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>Xシェア下書きプレビュー</title><style>
  body {
    margin: 0; padding: 24px;
    background: #2e3440; color: #eceff4;
    font-family: "Yu Gothic UI", "Meiryo", sans-serif;
  }
  h1 { font-size: 1.3rem; margin-bottom: 20px; }
  .card {
    background: #3b4252; border: 1px solid #4c566a; border-radius: 12px;
    padding: 18px 20px; margin-bottom: 22px;
  }
  .card h2 { margin: 0 0 12px; font-size: 1rem; color: #88c0d0; }
  .tiles { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 14px; }
  .tile {
    display: flex; align-items: center; justify-content: center;
    width: 40px; height: 55px;
    background: linear-gradient(160deg, #ffffff 0%, #f0efec 100%);
    border: 2px solid #b8c0cc; border-radius: 6px;
  }
  .tile img { width: 34px; height: 49px; object-fit: contain; }
  .tweet-text {
    white-space: pre-wrap; font-family: inherit; font-size: 0.95rem;
    background: #2e3440; border-radius: 8px; padding: 12px 14px; margin: 0 0 8px;
  }
  .problem-url { font-size: 0.85rem; color: #9fadbf; word-break: break-all; margin: 0 0 14px; }
  .open-btn {
    display: inline-block; padding: 9px 18px; background: #5e81ac; color: #eceff4;
    border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 0.9rem;
  }
</style></head>
<body>
  <h1>Xシェア下書きプレビュー</h1>
  ${cardsHtml}
</body></html>`;
}

const count = Number(process.argv[2]) || 5;
const drafts = pickTopCandidates(count);

const cards = drafts.map((d, i) => {
  // buildShareUrl が組み立てた投稿文をそのまま流用する（文言の二重管理を避けるため）
  const intentUrl = new URL(buildShareUrl(d.hand));
  const tweetText = decodeURIComponent(intentUrl.searchParams.get('text').replace(/\+/g, ' '));
  const problemUrl = decodeURIComponent(intentUrl.searchParams.get('url'));
  return draftHtml(d, i, tweetText, problemUrl, intentUrl.href);
});

mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'preview.html');
writeFileSync(outPath, previewPageHtml(cards.join('\n')));

console.log(`${drafts.length}件の下書きを生成しました。プレビューをブラウザで開きます: ${outPath}`);
if (process.platform === 'win32') {
  exec(`start "" "${outPath}"`);
}
