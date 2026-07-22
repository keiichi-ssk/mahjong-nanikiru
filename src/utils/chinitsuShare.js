// メンチン何切るドリルのシェア機能（純粋関数・DOM非依存）。
// 手牌を麻雀界隈の定着表記（萬子=漢数字・筒子=丸数字・索子=全角数字）のテキストにし、
// 「開くと同じ問題が出題される」URL（/chinitsu.html?q=1123455678999m 形式）を組み立てて
// X の Web Intent に渡す。API 登録・認証は不要。
//
// Xに渡すリンクは直接 /chinitsu.html ではなく /api/share を経由する（2026-07-22〜）。
// /api/share はその手牌専用のOGPカード画像（/api/og）を差し込んだHTMLを返し、
// 人間のブラウザだけ即座に /chinitsu.html?q=... へ自動遷移する。クローラー（Xの展開ボット）は
// JSを実行しないためリダイレクトを追わず、その手牌のカード画像がそのままシェアカードに表示される。

// api/ 配下（Vercel Functions）からも読み込まれるため拡張子を明示する（他のsrc/utilsは慣例で省略）
import { sortTiles } from './tileUtils.js';

// Xに渡すリンク先（手牌ごとのOGPカードを出す中継ページ。api/share.js が実装）
const SHARE_REDIRECT_URL = 'https://zagaku-mahjong.vercel.app/api/share';

const NOTATION = {
  m: ['一', '二', '三', '四', '五', '六', '七', '八', '九'],
  p: ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'],
  s: ['１', '２', '３', '４', '５', '６', '７', '８', '９'],
};

// 手牌14枚を牌姿テキストに変換する（例: ['1m','1m','2m',...] → '一一二…'）
export function handToNotation(hand) {
  return hand.map(t => NOTATION[t[1]][parseInt(t[0], 10) - 1]).join('');
}

// 手牌 → URLパラメータ（数字14桁+スーツ1字。例 '1123455678999m'）
export function encodeHandParam(hand) {
  return hand.map(t => t[0]).join('') + hand[0][1];
}

// URLパラメータ → 手牌。形式・枚数（同一牌4枚まで）を検証し、不正なら null
export function decodeHandParam(param) {
  if (typeof param !== 'string' || !/^[1-9]{14}[mps]$/.test(param)) return null;
  const suit = param[14];
  const ranks = param.slice(0, 14).split('');
  const counts = {};
  for (const r of ranks) {
    counts[r] = (counts[r] ?? 0) + 1;
    if (counts[r] > 4) return null;
  }
  return sortTiles(ranks.map(r => `${r}${suit}`));
}

// X（旧Twitter）の投稿画面を開くURL。投稿文はネタバレなし（手牌と問いかけのみ）
export function buildShareUrl(hand) {
  const text = [
    '【メンチン何切る】',
    handToNotation(hand),
    '',
    '何を切る？待ちは？',
    '',
    '#麻雀 #何切る #メンチン何切るドリル',
  ].join('\n');
  const shareUrl = `${SHARE_REDIRECT_URL}?q=${encodeHandParam(hand)}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
}
