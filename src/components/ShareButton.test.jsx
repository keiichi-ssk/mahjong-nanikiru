// シェアボタンの描画スモークテスト。
// このボタンは出題画面・メンチンドリル・タイムアタック・管理画面の4箇所で使い回すので、
// 2つの使い方（href で <a> / onClick で <button>）が両方生きていることを固定しておく。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ShareButton from './ShareButton';

describe('ShareButton', () => {
  it('href を渡すと <a> で描く（新しいタブで開く）', () => {
    const html = renderToStaticMarkup(<ShareButton href="https://example.com/x" />);
    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('この問題をシェア');
  });

  // 圧縮が非同期で URL がまだ無いあいだは何も描かない（空のリンクを出さない）
  it('href が無く onClick も無ければ何も描かない', () => {
    expect(renderToStaticMarkup(<ShareButton href={null} />)).toBe('');
  });

  // 管理画面は押した時点の編集内容から URL を作るので button で描く。
  // 入力のたびに圧縮し直さないための使い分けなので、この分岐を消さないこと
  it('onClick を渡すと <button> で描く', () => {
    const html = renderToStaticMarkup(<ShareButton onClick={() => {}}>Xで共有</ShareButton>);
    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('Xで共有');
  });

  // 問題画像付きの問題は共有できない（画像をURLに載せられないため）
  it('disabled を渡すと押せない', () => {
    const html = renderToStaticMarkup(<ShareButton onClick={() => {}} disabled title="理由" />);
    expect(html).toContain('disabled');
    expect(html).toContain('title="理由"');
  });

  // Xのロゴはこのコンポーネントが唯一の実装（複製しないこと）
  it('どちらの形でもXのロゴを描く', () => {
    expect(renderToStaticMarkup(<ShareButton href="https://example.com" />)).toContain('chinitsu-share-icon');
    expect(renderToStaticMarkup(<ShareButton onClick={() => {}} />)).toContain('chinitsu-share-icon');
  });
});
