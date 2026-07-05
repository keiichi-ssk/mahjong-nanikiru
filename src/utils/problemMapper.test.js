import { describe, it, expect } from 'vitest';
import { fromDb, toDb } from './problemMapper';

// DBの全カラムが揃った行（toDbの出力形式と同じ）
const fullRow = {
  id: 42,
  section: '25',
  image: '',
  tiles: ['1m', '2m', '3m', '4p', '5p', '6p', '7s', '8s', '9s', '1z', '1z', '5z', '5z'],
  answer: '5z',
  dora: '1m',
  riichi: true,
  explanation: 'ここは[5z]切り。',
  reviewed: true,
  disabled: false,
  melds: [{ type: 'pon', tiles: ['1z', '1z', '1z'] }],
  problem_type: 'default',
  discarded_tile: null,
  naki_choices: [],
  question_image_url: null,
  bakaze: '東',
  jikaze: '南',
  junme: 8,
  note: '3巡目に[1p]が2枚切れ。',
  other_discard: { player: '西', tiles: ['1z', '9m'], riichiIndex: null },
};

describe('fromDb（DB行 → アプリ内オブジェクト）', () => {
  const p = fromDb(fullRow);

  it('snake_case のフィールドが camelCase で参照できる', () => {
    expect(p.problemType).toBe('default');
    expect(p.discardedTile).toBeNull();
    expect(p.nakiChoices).toEqual([]);
    expect(p.questionImageUrl).toBeNull();
    expect(p.otherDiscard).toEqual(fullRow.other_discard);
  });

  it('dora の空文字は null に正規化される（未設定判定・引き継ぎのため）', () => {
    expect(fromDb({ ...fullRow, dora: '' }).dora).toBeNull();
    expect(fromDb({ ...fullRow, dora: '5m' }).dora).toBe('5m');
  });

  it('question_image_url / other_discard が無い古い行でも null になる', () => {
    const legacy = { ...fullRow };
    delete legacy.question_image_url;
    delete legacy.other_discard;
    const q = fromDb(legacy);
    expect(q.questionImageUrl).toBeNull();
    expect(q.otherDiscard).toBeNull();
  });
});

describe('toDb（アプリ内オブジェクト → DB行）', () => {
  it('camelCase のフィールドが snake_case カラムに入る', () => {
    const row = toDb({
      id: 1,
      section: '1',
      problemType: 'naki-choice',
      discardedTile: '3p',
      nakiChoices: [{ tile: '3p', correct: true }],
      questionImageUrl: 'https://example.com/x.png',
      otherDiscard: { player: '南', tiles: ['1m'], riichiIndex: 0 },
    });
    expect(row.problem_type).toBe('naki-choice');
    expect(row.discarded_tile).toBe('3p');
    expect(row.naki_choices).toEqual([{ tile: '3p', correct: true }]);
    expect(row.question_image_url).toBe('https://example.com/x.png');
    expect(row.other_discard).toEqual({ player: '南', tiles: ['1m'], riichiIndex: 0 });
  });

  it('未設定フィールドにデフォルト値が入る', () => {
    const row = toDb({ id: 1, section: '1' });
    expect(row).toEqual({
      id: 1,
      section: '1',
      image: '',
      tiles: [],
      answer: '',
      dora: '',
      riichi: null,
      explanation: '',
      reviewed: false,
      disabled: false,
      melds: [],
      problem_type: 'default',
      discarded_tile: null,
      naki_choices: [],
      question_image_url: null,
      bakaze: null,
      jikaze: null,
      junme: null,
      note: '',
      other_discard: null,
    });
  });
});

describe('fromDb / toDb の対称性（管理画面の保存→再読込で値が保持される）', () => {
  it('toDb(fromDb(row)) が元の行と一致する', () => {
    expect(toDb(fromDb(fullRow))).toEqual(fullRow);
  });

  it('dora 空文字の行も往復できる（"" → null → ""）', () => {
    const row = { ...fullRow, dora: '' };
    expect(toDb(fromDb(row))).toEqual(row);
  });

  it('riichi: false / null がそのまま保持される', () => {
    expect(toDb(fromDb({ ...fullRow, riichi: false })).riichi).toBe(false);
    expect(toDb(fromDb({ ...fullRow, riichi: null })).riichi).toBeNull();
  });

  it('2往復しても値が変わらない（冪等性）', () => {
    const once = toDb(fromDb(fullRow));
    const twice = toDb(fromDb(once));
    expect(twice).toEqual(once);
  });
});
