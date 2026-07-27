import { describe, it, expect } from 'vitest';
import { SEATS, seatWinds, collectCalledTiles, buildRiver } from './boardUtils';

// 河の見え方を「牌コード / X（裏向き）」＋鳴かれた牌の * で1行に潰す（期待値を読みやすくするため）
function render(river) {
  return river.map(c => `${c.hidden ? 'X' : c.tile}${c.called ? '*' : ''}`).join(' ');
}

describe('seatWinds（席順）', () => {
  it('自風が東なら 上家=北 / 対面=西 / 下家=南', () => {
    expect(seatWinds('東')).toEqual([
      { relative: '上家', wind: '北' },
      { relative: '対面', wind: '西' },
      { relative: '下家', wind: '南' },
    ]);
  });

  it('自風が未設定なら風は決められない', () => {
    expect(seatWinds(null).map(s => s.wind)).toEqual([null, null, null]);
    expect(seatWinds(null).map(s => s.relative)).toEqual(SEATS);
  });
});

describe('collectCalledTiles（鳴かれた牌を出した家ごとに集める）', () => {
  it('自分の副露は「自風から見た鳴いた元」の家から出ている', () => {
    const called = collectCalledTiles({
      jikaze: '東',
      melds: [{ type: 'pon', tiles: ['5p', '5p', '5p'], from: '対面' }],
    });
    // 東から見た対面は西
    expect(called).toEqual({ 西: ['5p'] });
  });

  it('他家の副露が自分から鳴かれたものなら自風のキーに入る', () => {
    const called = collectCalledTiles({
      jikaze: '南',
      otherDiscards: [
        // 西家の上家は南（＝自分）
        { player: '西', melds: [{ type: 'chi', tiles: ['3m', '4m', '5m'], from: '上家' }] },
      ],
    });
    expect(called).toEqual({ 南: ['3m'] });
  });

  it('鳴かれた牌は副露の1枚目（横向きになる牌）', () => {
    const called = collectCalledTiles({
      jikaze: '東',
      melds: [{ type: 'chi', tiles: ['7s', '8s', '9s'], from: '上家' }],
    });
    expect(called).toEqual({ 北: ['7s'] });
  });

  it('暗槓は鳴いた元が無いので対象外', () => {
    const called = collectCalledTiles({
      jikaze: '東',
      melds: [{ type: 'ankan', tiles: ['1z', '1z', '1z', '1z'], from: null }],
    });
    expect(called).toEqual({});
  });

  it('自風が未設定でも他家どうしの鳴きは集まる（自分の副露は特定できない）', () => {
    const called = collectCalledTiles({
      jikaze: null,
      melds: [{ type: 'pon', tiles: ['1m', '1m', '1m'], from: '上家' }],
      otherDiscards: [{ player: '東', melds: [{ type: 'pon', tiles: ['9p', '9p', '9p'], from: '下家' }] }],
    });
    expect(called).toEqual({ 南: ['9p'] });
  });

  it('同じ家から複数回鳴かれたら牌がすべて集まる', () => {
    const called = collectCalledTiles({
      jikaze: '東',
      melds: [
        { type: 'pon', tiles: ['2s', '2s', '2s'], from: '下家' },
        { type: 'pon', tiles: ['6m', '6m', '6m'], from: '下家' },
      ],
    });
    expect(called).toEqual({ 南: ['2s', '6m'] });
  });
});

describe('buildRiver（河の組み立て）', () => {
  it('捨て牌データがある家はデータどおりに表示し、裏向きで補完しない', () => {
    const river = buildRiver({ tiles: ['1m', '2m', '3m'], junme: 8, meldCount: 0 });
    expect(render(river)).toBe('1m 2m 3m');
  });

  it('データが無い家は「巡目＋副露数」枚の裏向きになる', () => {
    expect(render(buildRiver({ tiles: [], junme: 5, meldCount: 0 }))).toBe('X X X X X');
    expect(render(buildRiver({ tiles: [], junme: 5, meldCount: 2 }))).toBe('X X X X X X X');
  });

  it('巡目が未設定なら裏向きは並べない', () => {
    expect(buildRiver({ tiles: [], junme: null, meldCount: 3 })).toEqual([]);
  });

  it('鳴かれた牌は河から減らさず網掛けになる', () => {
    const river = buildRiver({ tiles: ['1m', '5p', '9s'], junme: 6, calledTiles: ['5p'] });
    expect(render(river)).toBe('1m 5p* 9s');
    expect(river).toHaveLength(3);
  });

  it('同じ牌が複数あれば前（先に捨てた方）が鳴かれたことになる', () => {
    const river = buildRiver({ tiles: ['3z', '1m', '3z'], junme: 6, calledTiles: ['3z'] });
    expect(render(river)).toBe('3z* 1m 3z');
  });

  it('同じ牌が2回鳴かれたら前から順に2枚とも網掛けになる', () => {
    const river = buildRiver({ tiles: ['3z', '3z', '3z'], junme: 6, calledTiles: ['3z', '3z'] });
    expect(render(river)).toBe('3z* 3z* 3z');
  });

  it('データに無い牌が鳴かれていても河は増えない（データ以外は表示しない）', () => {
    const river = buildRiver({ tiles: ['1m'], junme: 6, calledTiles: ['9p'] });
    expect(render(river)).toBe('1m');
  });

  it('データが無い家では鳴かれた牌だけ表向きで末尾に置かれる', () => {
    const river = buildRiver({ tiles: [], junme: 4, meldCount: 0, calledTiles: ['5z'] });
    expect(render(river)).toBe('X X X 5z*');
    expect(river).toHaveLength(4);
  });

  it('巡目が未設定でも鳴かれた牌だけは表示する', () => {
    expect(render(buildRiver({ tiles: [], junme: null, calledTiles: ['5z'] }))).toBe('5z*');
  });

  it('revealCalled: false なら鳴かれた牌も裏向きのまま網掛けになる（他家の河）', () => {
    const river = buildRiver({ tiles: [], junme: 4, calledTiles: ['5z'], revealCalled: false });
    expect(render(river)).toBe('X X X X*');
    expect(river).toHaveLength(4);
  });

  it('データがある河は revealCalled に関係なく表向き（入力した牌をそのまま出す）', () => {
    const river = buildRiver({ tiles: ['1m', '5p'], junme: 4, calledTiles: ['5p'], revealCalled: false });
    expect(render(river)).toBe('1m 5p*');
  });

  it('鳴かれた枚数が巡目を超えても牌が消えない', () => {
    const river = buildRiver({ tiles: [], junme: 1, meldCount: 0, calledTiles: ['1p', '2p'] });
    expect(render(river)).toBe('1p* 2p*');
  });
});
