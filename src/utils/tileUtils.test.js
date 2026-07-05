import { describe, it, expect } from 'vitest';
import {
  getTileImageUrl,
  getTileLabel,
  getDoraIndicator,
  randomSuitMap,
  remapProblem,
} from './tileUtils';

describe('getTileImageUrl', () => {
  it('牌コードをSVGパスに変換する', () => {
    expect(getTileImageUrl('1m')).toBe('/tiles/Man1.svg');
    expect(getTileImageUrl('7z')).toBe('/tiles/Chun.svg');
    expect(getTileImageUrl('back')).toBe('/tiles/Back.svg');
  });

  it('赤5は専用画像（Dora付き）', () => {
    expect(getTileImageUrl('0m')).toBe('/tiles/Man5-Dora.svg');
    expect(getTileImageUrl('0p')).toBe('/tiles/Pin5-Dora.svg');
    expect(getTileImageUrl('0s')).toBe('/tiles/Sou5-Dora.svg');
  });

  it('不明なコードは null', () => {
    expect(getTileImageUrl('9z')).toBeNull();
    expect(getTileImageUrl('')).toBeNull();
  });
});

describe('getTileLabel', () => {
  it('日本語名を返す', () => {
    expect(getTileLabel('1m')).toBe('一萬');
    expect(getTileLabel('0s')).toBe('赤五索');
    expect(getTileLabel('6z')).toBe('發');
  });

  it('不明なコードはそのまま返す', () => {
    expect(getTileLabel('xx')).toBe('xx');
  });
});

describe('getDoraIndicator（ドラ→ドラ表示牌の逆算）', () => {
  it('数牌は1つ前の牌', () => {
    expect(getDoraIndicator('5m')).toBe('4m');
    expect(getDoraIndicator('9p')).toBe('8p');
    expect(getDoraIndicator('2s')).toBe('1s');
  });

  it('1のドラは9が表示牌（巡回）', () => {
    expect(getDoraIndicator('1m')).toBe('9m');
    expect(getDoraIndicator('1p')).toBe('9p');
    expect(getDoraIndicator('1s')).toBe('9s');
  });

  it('赤5は5として扱う（表示牌は4）', () => {
    expect(getDoraIndicator('0m')).toBe('4m');
    expect(getDoraIndicator('0p')).toBe('4p');
    expect(getDoraIndicator('0s')).toBe('4s');
  });

  it('風牌は東南西北で巡回', () => {
    expect(getDoraIndicator('1z')).toBe('4z'); // 東ドラ ← 北表示
    expect(getDoraIndicator('2z')).toBe('1z');
    expect(getDoraIndicator('3z')).toBe('2z');
    expect(getDoraIndicator('4z')).toBe('3z');
  });

  it('三元牌は白發中で巡回', () => {
    expect(getDoraIndicator('5z')).toBe('7z'); // 白ドラ ← 中表示
    expect(getDoraIndicator('6z')).toBe('5z');
    expect(getDoraIndicator('7z')).toBe('6z');
  });

  it('未設定なら null', () => {
    expect(getDoraIndicator(null)).toBeNull();
    expect(getDoraIndicator('')).toBeNull();
    expect(getDoraIndicator(undefined)).toBeNull();
  });
});

describe('randomSuitMap', () => {
  it('常に m/p/s の置換（全順列のいずれか）を返す', () => {
    for (let i = 0; i < 30; i++) {
      const map = randomSuitMap();
      expect(Object.keys(map).sort()).toEqual(['m', 'p', 's']);
      expect(Object.values(map).sort()).toEqual(['m', 'p', 's']);
    }
  });
});

describe('remapProblem（スーツ置換）', () => {
  // m→p, p→s, s→m の固定マップで検証
  const suitMap = { m: 'p', p: 's', s: 'm' };

  const problem = {
    id: 1,
    section: '5',
    tiles: ['1m', '0m', '5p', '9s', '1z', '7z'],
    answer: '5p',
    dora: '3s',
    riichi: true,
    melds: [{ type: 'pon', tiles: ['4m', '4m', '4m'] }],
    discardedTile: '2p',
    nakiChoices: [{ tile: '6s', correct: true }, { tile: '8p', correct: false }],
    explanation: 'ここは[3m]切り。[1z]は残す。',
    note: '上家が[7p]を切った直後。',
    otherDiscard: { player: '東', tiles: ['1m', '9p', '5z'], riichiIndex: 1 },
  };

  const remapped = remapProblem(problem, suitMap);

  it('手牌が置換される（字牌はそのまま・赤5の0プレフィックス維持）', () => {
    expect(remapped.tiles).toEqual(['1p', '0p', '5s', '9m', '1z', '7z']);
  });

  it('answer / dora / discardedTile が置換される', () => {
    expect(remapped.answer).toBe('5s');
    expect(remapped.dora).toBe('3m');
    expect(remapped.discardedTile).toBe('2s');
  });

  it('ankan: 形式の answer も中の牌だけ置換される', () => {
    const p = remapProblem({ ...problem, answer: 'ankan:5m' }, suitMap);
    expect(p.answer).toBe('ankan:5p');
  });

  it('melds の牌が置換され type は維持される', () => {
    expect(remapped.melds).toEqual([{ type: 'pon', tiles: ['4p', '4p', '4p'] }]);
  });

  it('nakiChoices の牌が置換され correct フラグは維持される', () => {
    expect(remapped.nakiChoices).toEqual([
      { tile: '6m', correct: true },
      { tile: '8s', correct: false },
    ]);
  });

  it('explanation / note 内の [Xm] 表記が置換される（字牌表記はそのまま）', () => {
    expect(remapped.explanation).toBe('ここは[3p]切り。[1z]は残す。');
    expect(remapped.note).toBe('上家が[7s]を切った直後。');
  });

  it('otherDiscard の牌が置換され player / riichiIndex は維持される', () => {
    expect(remapped.otherDiscard).toEqual({
      player: '東',
      tiles: ['1p', '9s', '5z'],
      riichiIndex: 1,
    });
  });

  it('牌以外のフィールドは変化しない', () => {
    expect(remapped.id).toBe(1);
    expect(remapped.section).toBe('5');
    expect(remapped.riichi).toBe(true);
  });

  it('null/未設定フィールドがあっても落ちない', () => {
    const minimal = { id: 2, tiles: ['1m'], answer: '1m', dora: null };
    const r = remapProblem(minimal, suitMap);
    expect(r.tiles).toEqual(['1p']);
    expect(r.answer).toBe('1p');
    expect(r.dora).toBeNull();
    expect(r.melds).toBeUndefined();
    expect(r.otherDiscard).toBeUndefined();
  });

  it('恒等マップなら元と同じ内容になる', () => {
    const identity = { m: 'm', p: 'p', s: 's' };
    expect(remapProblem(problem, identity)).toEqual(problem);
  });
});
