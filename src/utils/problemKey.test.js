// 集計のバージョン計算。**変えると過去の集計と繋がらなくなる**ので、
// 「何を含め、何を含めないか」と実際のハッシュ値をゴールデンテストで固定する。
import { describe, it, expect } from 'vitest';
import { problemKey } from './problemKey';

const base = {
  id: 'p1',
  title: '実戦の一打',
  tiles: ['2m', '3m', '4m', '5p', '6p', '7p', '3s', '4s', '5s', '7s', '8s', '1z', '1z', '9m'],
  melds: [],
  answer: '9m',
  dora: '4z',
  riichi: null,
  explanation: '9m は安全牌',
  note: '相手はリーチ',
  problemType: 'default',
  discardedTile: null,
  nakiChoices: [],
  bakaze: '東',
  kyoku: 1,
  honba: 0,
  jikaze: '南',
  junme: 9,
  otherDiscards: [],
  scores: { 東: 25000, 南: 25000, 西: 25000, 北: 25000, kyotaku: 0 },
};

describe('problemKey', () => {
  // ★ ゴールデン。この値が変わったら、**それまでに集めた集計が全部リセットされる**。
  //   落ちたときは安易に書き換えず、リセットしてよい変更かを判断すること
  it('同じ骨格なら常に同じ値になる（ゴールデン）', async () => {
    expect(await problemKey(base)).toBe('97807e037f84e6b3');
  });

  it('16文字の16進文字列', async () => {
    expect(await problemKey(base)).toMatch(/^[0-9a-f]{16}$/);
  });

  // ── 集計を引き継ぐもの（＝バージョンを変えない）────────────────
  // 解説の誤字を直しただけで「みんなの選択」が消えるのは困る
  it.each([
    ['解説', { explanation: '書き直した解説' }],
    ['注釈', { note: '注釈を変えた' }],
    ['タイトル', { title: '別のタイトル' }],
    ['正解', { answer: '1z' }],
    ['リーチ設定', { riichi: true }],
  ])('%s を変えてもバージョンは変わらない', async (_label, patch) => {
    expect(await problemKey({ ...base, ...patch })).toBe(await problemKey(base));
  });

  // ── 別の問題になるもの（＝集計をリセットする）──────────────────
  it.each([
    ['手牌', { tiles: [...base.tiles.slice(0, 13), '1m'] }],
    ['ドラ', { dora: '1z' }],
    ['副露', { melds: [{ type: 'pon', tiles: ['1p', '1p', '1p'], from: '上家' }] }],
    ['巡目', { junme: 12 }],
    ['場風', { bakaze: '南' }],
    ['自風', { jikaze: '西' }],
    ['局', { kyoku: 3 }],
    ['本場', { honba: 2 }],
    ['問題タイプ', { problemType: 'riichi-judgment' }],
    ['点数', { scores: { ...base.scores, 東: 30000 } }],
    ['他家の捨て牌', { otherDiscards: [{ player: '上家', tiles: ['1z'], riichiIndex: null, melds: [], tsumogiri: null }] }],
  ])('%s を変えるとバージョンが変わる', async (_label, patch) => {
    expect(await problemKey({ ...base, ...patch })).not.toBe(await problemKey(base));
  });

  // 欠けたフィールドがあっても落ちない（旧データ・作りかけの問題）
  it('空の問題でも計算できる', async () => {
    await expect(problemKey({})).resolves.toMatch(/^[0-9a-f]{16}$/);
    await expect(problemKey(null)).resolves.toMatch(/^[0-9a-f]{16}$/);
  });

  // 副露の「鳴いた元」は牌姿の一部（横向きの位置が変わる）
  it('副露の from が違えば別の問題として扱う', async () => {
    const a = { ...base, melds: [{ type: 'pon', tiles: ['1p', '1p', '1p'], from: '上家' }] };
    const b = { ...base, melds: [{ type: 'pon', tiles: ['1p', '1p', '1p'], from: '下家' }] };
    expect(await problemKey(a)).not.toBe(await problemKey(b));
  });
});
