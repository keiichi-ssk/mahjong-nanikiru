import { describe, it, expect } from 'vitest';
import {
  emptyDiscardBlock, toDiscardBlock, addDiscardTile, removeDiscardTile,
  moveDiscardTile, clearDiscardTiles, toggleDiscardRiichi,
} from './discardEdit';

// 牌・リーチ宣言牌・ツモ切りの対応を1行で見比べるための表示。
// ずれると河の見た目が丸ごと嘘になるので、すべての操作でこの形を確認する
const render = od => od.tiles
  .map((t, i) => `${t}${od.riichiIndex === i ? 'R' : ''}${od.tsumogiri?.[i] ? 'T' : ''}`)
  .join(' ');

const block = (tiles, { riichiIndex = null, tsumogiri = null } = {}) => ({
  player: '東', tiles, riichiIndex, melds: [], tsumogiri,
});

describe('toDiscardBlock（読み込んだ河を編集用にそろえる）', () => {
  // ★ ここで拾い漏らすと、編集画面を通した時点で情報が消える（実際に tsumogiri を落としていた）
  it('problem.otherDiscards[] の全フィールドを引き継ぐ', () => {
    const od = {
      player: '南', tiles: ['1m', '2m'], riichiIndex: 1,
      melds: [{ type: 'pon', tiles: ['5z', '5z', '5z'], from: '上家' }],
      tsumogiri: [false, true],
    };
    expect(toDiscardBlock(od)).toEqual(od);
    // 落とし穴を検出するため、鍵の集合そのものも突き合わせる
    expect(Object.keys(toDiscardBlock(od)).sort()).toEqual(Object.keys(emptyDiscardBlock()).sort());
  });

  it('ツモ切りが無い旧データは null のまま（全部手出しにしない）', () => {
    expect(toDiscardBlock({ player: '東', tiles: ['1m'] }).tsumogiri).toBeNull();
  });

  it('ツモ切りの長さが牌とずれていたら牌にそろえる', () => {
    expect(toDiscardBlock({ tiles: ['1m', '2m', '3m'], tsumogiri: [true] }).tsumogiri)
      .toEqual([true, false, false]);
  });

  it('副露が無い旧データは [] に補われる', () => {
    expect(toDiscardBlock({ tiles: [] }).melds).toEqual([]);
  });
});

describe('addDiscardTile', () => {
  it('ツモ切りが分かっている河には「手出し」として足す', () => {
    const od = addDiscardTile(block(['1m', '2m'], { tsumogiri: [true, false] }), '3m');
    expect(render(od)).toBe('1mT 2m 3m');
  });

  // 手で作った河に「全部手出し」という情報を付けてはいけない
  it('ツモ切りが分からない河は null のまま', () => {
    expect(addDiscardTile(block(['1m']), '2m').tsumogiri).toBeNull();
  });
});

describe('removeDiscardTile', () => {
  it('牌・リーチ宣言牌・ツモ切りが同じようにずれる', () => {
    const od = block(['1m', '2m', '3m', '4m'], { riichiIndex: 2, tsumogiri: [false, true, false, true] });
    expect(render(od)).toBe('1m 2mT 3mR 4mT');
    expect(render(removeDiscardTile(od, 0))).toBe('2mT 3mR 4mT');   // 前を消すと全部1つ前へ
    expect(render(removeDiscardTile(od, 3))).toBe('1m 2mT 3mR');    // 後ろを消しても前は動かない
  });

  it('リーチ宣言牌そのものを消すと解除される', () => {
    const od = block(['1m', '2m'], { riichiIndex: 1, tsumogiri: [true, true] });
    const next = removeDiscardTile(od, 1);
    expect(next.riichiIndex).toBeNull();
    expect(render(next)).toBe('1mT');
  });

  it('ツモ切りが分からない河は null のまま', () => {
    expect(removeDiscardTile(block(['1m', '2m']), 0).tsumogiri).toBeNull();
  });
});

describe('moveDiscardTile', () => {
  // insertAt は移動前の配列基準の挿入位置（ドラッグ中のインジケーターの位置）
  it('ツモ切りが牌と一緒に動く', () => {
    const od = block(['1m', '2m', '3m'], { tsumogiri: [true, false, false] });
    expect(render(moveDiscardTile(od, 0, 3))).toBe('2m 3m 1mT');   // 先頭を末尾へ
    expect(render(moveDiscardTile(od, 2, 0))).toBe('3m 1mT 2m');   // 末尾を先頭へ
  });

  it('リーチ宣言牌も追従する', () => {
    const od = block(['1m', '2m', '3m'], { riichiIndex: 0, tsumogiri: [false, true, false] });
    expect(render(od)).toBe('1mR 2mT 3m');
    expect(render(moveDiscardTile(od, 0, 3))).toBe('2mT 3m 1mR');
    expect(render(moveDiscardTile(od, 2, 0))).toBe('3m 1mR 2mT');
  });

  it('並びが変わらない位置なら同じブロックを返す', () => {
    const od = block(['1m', '2m'], { tsumogiri: [true, false] });
    expect(moveDiscardTile(od, 0, 0)).toBe(od);
    expect(moveDiscardTile(od, 0, 1)).toBe(od);
  });

  it('ツモ切りが分からない河は null のまま', () => {
    expect(moveDiscardTile(block(['1m', '2m']), 0, 2).tsumogiri).toBeNull();
  });
});

describe('clearDiscardTiles / toggleDiscardRiichi', () => {
  it('クリアするとツモ切りも「分からない」に戻る', () => {
    const od = clearDiscardTiles(block(['1m', '2m'], { riichiIndex: 0, tsumogiri: [true, false] }));
    expect(od.tiles).toEqual([]);
    expect(od.riichiIndex).toBeNull();
    expect(od.tsumogiri).toBeNull();
  });

  it('リーチ宣言牌は同じ牌をもう一度指定すると解除される', () => {
    const od = block(['1m', '2m']);
    expect(toggleDiscardRiichi(od, 1).riichiIndex).toBe(1);
    expect(toggleDiscardRiichi(toggleDiscardRiichi(od, 1), 1).riichiIndex).toBeNull();
  });

  // 家や副露は捨て牌の操作で消えてはいけない
  it('どの操作でも家と副露は保たれる', () => {
    const od = { ...block(['1m', '2m'], { tsumogiri: [true, false] }), melds: [{ type: 'pon', tiles: ['5z', '5z', '5z'], from: '上家' }] };
    for (const next of [
      addDiscardTile(od, '3m'), removeDiscardTile(od, 0),
      moveDiscardTile(od, 0, 2), clearDiscardTiles(od), toggleDiscardRiichi(od, 0),
    ]) {
      expect(next.player).toBe('東');
      expect(next.melds).toHaveLength(1);
    }
  });
});
