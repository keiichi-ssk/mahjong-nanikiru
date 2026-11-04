import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// index.css の配色トークン（:root）が、読みやすさの基準（WCAG 2.1 AA）を満たしているかを検査する。
// 色を変えたときに「読めない文字色」「見えない枠線」を作っていないかを、目視ではなくテストで止めるためのもの。
// ★ 組み合わせ（下の PAIRS）は「実際に画面でその色の上に置いている」ものだけを並べる。
//   新しい組み合わせを画面で使い始めたら、ここにも足すこと。

const INDEX_CSS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.css');

// index.css の指定したブロックから --color-xxx: #rrggbb を取り出す（rgba() のトークンは対象外）。
// ライトは最初の「:root {」、ダークは「:root[data-theme="dark"] {」
function readTokens(header) {
  const css = fs.readFileSync(INDEX_CSS, 'utf8');
  const start = css.indexOf(header);
  if (start < 0) throw new Error(`index.css に ${header} が見つからない`);
  const block = css.slice(start + header.length, css.indexOf('}', start));
  const tokens = {};
  for (const [, name, hex] of block.matchAll(/--(color-[a-z-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    tokens[name] = hex;
  }
  return tokens;
}

// WCAG 2.1 の相対輝度とコントラスト比
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [前景, 背景, 必要な比, 何の組み合わせか]
// 文字は 4.5:1、ボタンの枠など文字以外の見分けに必要な部分は 3:1（WCAG 1.4.3 / 1.4.11）
const PAIRS = [
  ['color-text', 'color-bg', 4.5, '本文'],
  ['color-text', 'color-surface', 4.5, '面の上の本文'],
  ['color-text-bright', 'color-bg', 4.5, '見出し'],
  ['color-text-secondary', 'color-bg', 4.5, '補足の文字'],
  ['color-text-secondary', 'color-surface', 4.5, '面の上の補足の文字'],
  ['color-text-muted', 'color-bg', 4.5, '控えめな文字'],
  ['color-accent', 'color-bg', 4.5, '主色の文字（線のボタン・選択中のタブ）'],
  ['color-on-primary', 'color-primary', 4.5, '塗りのボタンの文字'],
  ['color-on-primary', 'color-primary-hover', 4.5, '塗りのボタン（hover）の文字'],
  ['color-success', 'color-bg', 4.5, '正解の文字'],
  ['color-danger', 'color-bg', 4.5, '不正解の文字'],
  ['color-warning', 'color-bg', 4.5, '注意の文字'],
  ['color-outline', 'color-bg', 3, '線のボタンの枠'],
];

describe.each([
  ['ライト', ':root {'],
  ['ダーク', ':root[data-theme="dark"] {'],
])('配色トークンのコントラスト（%s）', (_, header) => {
  const tokens = readTokens(header);

  it.each(PAIRS)('%s × %s が %s:1 以上（%s）', (fg, bg, min) => {
    expect(tokens[fg], `--${fg} が見つからない`).toBeDefined();
    expect(tokens[bg], `--${bg} が見つからない`).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });

  it('主色（藍）と正解の色は別の色にする（押せる場所と結果を色で区別するため）', () => {
    expect(tokens['color-primary']).not.toBe(tokens['color-success']);
  });
});

it('ダークはライトと同じトークンをすべて定義している（片方だけ足して、ダークで旧い値が残るのを防ぐ）', () => {
  const light = Object.keys(readTokens(':root {'));
  const dark = Object.keys(readTokens(':root[data-theme="dark"] {'));
  expect(dark.sort()).toEqual(light.sort());
});
