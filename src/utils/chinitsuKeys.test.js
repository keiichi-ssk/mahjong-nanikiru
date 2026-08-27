import { describe, it, expect } from 'vitest';
import { resolveKeyAction } from './chinitsuKeys';

// 手牌に 1,2,3,5,7,9 だけがある想定（4/6/8 は手牌に無い数字）
const HAND_DIGITS = [1, 1, 2, 3, 3, 5, 5, 5, 7, 9, 9, 9, 9, 2];

// 切る牌がまだ未選択の状態
const CHOOSING_DISCARD = { answered: false, hasDiscard: false, waitCount: 0, handDigits: HAND_DIGITS };
// 切る牌を選び終え、待ち牌を選んでいる状態
const CHOOSING_WAIT = { answered: false, hasDiscard: true, waitCount: 0, handDigits: HAND_DIGITS };
// 解答パネル表示中
const ANSWERED = { answered: true, hasDiscard: true, waitCount: 2, handDigits: HAND_DIGITS };

const key = (k, extra = {}) => ({ key: k, code: '', ...extra });

describe('resolveKeyAction: 1〜9 の段階制', () => {
  it('切る牌が未選択なら 1〜9 は切る牌の選択になる', () => {
    expect(resolveKeyAction(key('3'), CHOOSING_DISCARD)).toEqual({ type: 'discard', digit: 3 });
  });

  it('切る牌が選択済みなら 1〜9 は待ち牌のトグルになる', () => {
    expect(resolveKeyAction(key('3'), CHOOSING_WAIT)).toEqual({ type: 'wait', digit: 3 });
  });

  it('手牌に無い数字は切る牌として無視される', () => {
    expect(resolveKeyAction(key('4'), CHOOSING_DISCARD)).toBeNull();
  });

  it('待ち牌は手牌に無い数字でも選べる（9種すべてが候補）', () => {
    expect(resolveKeyAction(key('4'), CHOOSING_WAIT)).toEqual({ type: 'wait', digit: 4 });
  });
});

describe('resolveKeyAction: 回答・進行のキー', () => {
  it('- と 0 と n はノーテン（切る牌の選択状態に関わらず）', () => {
    expect(resolveKeyAction(key('-'), CHOOSING_DISCARD)).toEqual({ type: 'noten' });
    expect(resolveKeyAction(key('Unidentified', { code: 'NumpadSubtract' }), CHOOSING_DISCARD)).toEqual({ type: 'noten' });
    expect(resolveKeyAction(key('0'), CHOOSING_DISCARD)).toEqual({ type: 'noten' });
    expect(resolveKeyAction(key('0'), CHOOSING_WAIT)).toEqual({ type: 'noten' });
    expect(resolveKeyAction(key('n'), CHOOSING_DISCARD)).toEqual({ type: 'noten' });
    expect(resolveKeyAction(key('N'), CHOOSING_DISCARD)).toEqual({ type: 'noten' });
  });

  it('+ と t はツモ', () => {
    expect(resolveKeyAction(key('+'), CHOOSING_DISCARD)).toEqual({ type: 'tsumo' });
    expect(resolveKeyAction(key('Unidentified', { code: 'NumpadAdd' }), CHOOSING_DISCARD)).toEqual({ type: 'tsumo' });
    expect(resolveKeyAction(key('t'), CHOOSING_DISCARD)).toEqual({ type: 'tsumo' });
  });

  it('Enter は未回答なら「回答する」、解答パネル表示中なら「次の問題へ」', () => {
    expect(resolveKeyAction(key('Enter'), CHOOSING_WAIT)).toEqual({ type: 'submit' });
    expect(resolveKeyAction(key('Enter'), ANSWERED)).toEqual({ type: 'next' });
  });

  it('Backspace は待ちがあれば1枚解除、無ければ切る牌の解除', () => {
    expect(resolveKeyAction(key('Backspace'), { ...CHOOSING_WAIT, waitCount: 2 })).toEqual({ type: 'undoWait' });
    expect(resolveKeyAction(key('Backspace'), { ...CHOOSING_WAIT, waitCount: 0 })).toEqual({ type: 'undoDiscard' });
  });
});

describe('resolveKeyAction: 拾わないキー', () => {
  it('解答パネル表示中は Enter 以外を受け付けない（誤って回答が動かないように）', () => {
    expect(resolveKeyAction(key('3'), ANSWERED)).toBeNull();
    expect(resolveKeyAction(key('0'), ANSWERED)).toBeNull();
    expect(resolveKeyAction(key('+'), ANSWERED)).toBeNull();
    expect(resolveKeyAction(key('-'), ANSWERED)).toBeNull();
    expect(resolveKeyAction(key('Backspace'), ANSWERED)).toBeNull();
  });

  it('修飾キー付きはブラウザのショートカットなので拾わない', () => {
    expect(resolveKeyAction(key('3', { ctrlKey: true }), CHOOSING_DISCARD)).toBeNull();
    expect(resolveKeyAction(key('3', { metaKey: true }), CHOOSING_DISCARD)).toBeNull();
    expect(resolveKeyAction(key('Enter', { altKey: true }), ANSWERED)).toBeNull();
  });

  it('割り当てのないキーは無視する', () => {
    expect(resolveKeyAction(key('a'), CHOOSING_DISCARD)).toBeNull();
    expect(resolveKeyAction(key('ArrowLeft'), CHOOSING_DISCARD)).toBeNull();
    expect(resolveKeyAction(key(' '), CHOOSING_WAIT)).toBeNull();
  });
});

describe('resolveKeyAction: NumLock オフのテンキー', () => {
  // NumLock オフだと key は 'End' / 'ArrowDown' などになるが、code は物理キーのまま届く
  it('code の Numpad1〜Numpad9 から数字を取れる', () => {
    expect(resolveKeyAction(key('End', { code: 'Numpad1' }), CHOOSING_DISCARD)).toEqual({ type: 'discard', digit: 1 });
    expect(resolveKeyAction(key('ArrowDown', { code: 'Numpad2' }), CHOOSING_WAIT)).toEqual({ type: 'wait', digit: 2 });
    expect(resolveKeyAction(key('Insert', { code: 'Numpad0' }), CHOOSING_DISCARD)).toEqual({ type: 'noten' });
  });

  it('NumLock オンのテンキー（key も code も来る）でも同じ結果になる', () => {
    expect(resolveKeyAction(key('1', { code: 'Numpad1' }), CHOOSING_DISCARD)).toEqual({ type: 'discard', digit: 1 });
  });
});
