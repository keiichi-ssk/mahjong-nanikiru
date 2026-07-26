import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isWinningHand } from './chinitsuUtils';

// 検証対象は chinitsu.html に静的HTMLで書いてある説明テキスト（.chinitsu-about）。
// あの文章はJSを実行しないクローラー向けにHTMLへ直接書いてあり、コンポーネントが存在しないため
// 通常のユニットテストでは守られない。牌姿の例が誤っていても誰も気づけないので、ここで押さえる。
// 例を差し替えるときは chinitsu.html の文章を直すだけでよい（このテストが本文を読んで再検証する）。
//
// 2026-07-26 に本文を短縮して牌姿の例が無くなったため、現在このテストは自動でスキップされる。
// 本文に「例：（14桁の数字）」を書き戻せば再び有効になるので、消さずに残してある。

function aboutText() {
  const html = readFileSync(resolve('chinitsu.html'), 'utf8');
  const section = html.match(/<section class="chinitsu-about">[\s\S]*?<\/section>/);
  if (!section) throw new Error('chinitsu.html に .chinitsu-about セクションが見つからない');
  return section[0]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const hasHandExample = /例：\d{14}/.test(aboutText());

describe('chinitsu.html の説明テキスト（.chinitsu-about）', () => {
  it.skipIf(!hasHandExample)('例に挙げた手牌がアガリ形になっていない', () => {
    const hand = aboutText().match(/例：(\d{14})/)?.[1];
    expect(hand, '本文から14枚の牌姿を読み取れない').toBeTruthy();
    // アガリ形だと「ツモ」が正解の手牌になり、何切るの例として成立しない
    expect(isWinningHand([...hand].map((n) => `${n}p`))).toBe(false);
  });

  it.skipIf(!hasHandExample)('本文に書いた打牌と待ちが判定エンジンの結果と一致する', () => {
    const text = aboutText();
    const hand = text.match(/例：(\d{14})/)?.[1];
    const discard = text.match(/(\d)を切ると/)?.[1];
    const waits = text.match(/を切ると ([\d・]+) の/)?.[1]?.split('・');
    expect(hand && discard && waits, '本文から牌姿・打牌・待ちを読み取れない').toBeTruthy();

    const rest = [...hand];
    rest.splice(rest.indexOf(discard), 1);
    const actual = [];
    for (let n = 1; n <= 9; n++) {
      if (isWinningHand([...rest, String(n)].map((t) => `${t}p`))) actual.push(String(n));
    }
    expect(actual).toEqual(waits);
  });
});
