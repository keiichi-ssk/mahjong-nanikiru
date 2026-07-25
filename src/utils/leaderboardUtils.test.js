import { describe, it, expect } from 'vitest';
import {
  jstDayStartISO,
  sanitizeScore,
  sanitizeName,
  rankForScore,
  MAX_SCORE,
  MAX_NAME_LENGTH,
} from './leaderboardUtils';

describe('jstDayStartISO', () => {
  it('JST昼間 → その日のJST0時（UTCで前日15時）を返す', () => {
    // 2026-07-25 10:00 UTC = JST 2026-07-25 19:00 → 当日開始は JST 2026-07-25 00:00 = UTC 2026-07-24 15:00
    expect(jstDayStartISO(new Date('2026-07-25T10:00:00Z'))).toBe('2026-07-24T15:00:00.000Z');
  });

  it('UTCでは翌日になっているがJSTではまだ同日の時刻を正しく扱う', () => {
    // 2026-07-25 20:00 UTC = JST 2026-07-26 05:00 → 当日開始は JST 2026-07-26 00:00 = UTC 2026-07-25 15:00
    expect(jstDayStartISO(new Date('2026-07-25T20:00:00Z'))).toBe('2026-07-25T15:00:00.000Z');
  });

  it('JST深夜0時直後は、その日の開始時刻を返す（日付境界）', () => {
    // 2026-07-25 15:00:01 UTC = JST 2026-07-26 00:00:01 → 当日開始は UTC 2026-07-25 15:00:00
    expect(jstDayStartISO(new Date('2026-07-25T15:00:01Z'))).toBe('2026-07-25T15:00:00.000Z');
  });

  it('JST深夜0時直前は、まだ前日の開始時刻を返す', () => {
    // 2026-07-25 14:59:59 UTC = JST 2026-07-25 23:59:59 → 当日開始は UTC 2026-07-24 15:00:00
    expect(jstDayStartISO(new Date('2026-07-25T14:59:59Z'))).toBe('2026-07-24T15:00:00.000Z');
  });
});

describe('sanitizeScore', () => {
  it('0〜MAX_SCORE の整数はそのまま通す', () => {
    expect(sanitizeScore(0)).toBe(0);
    expect(sanitizeScore(15)).toBe(15);
    expect(sanitizeScore(MAX_SCORE)).toBe(MAX_SCORE);
  });

  it('数字文字列も数値として受け付ける', () => {
    expect(sanitizeScore('15')).toBe(15);
  });

  it('上限超過・負数・小数・非数値は null（拒否）', () => {
    expect(sanitizeScore(MAX_SCORE + 1)).toBeNull();
    expect(sanitizeScore(9999)).toBeNull();
    expect(sanitizeScore(-1)).toBeNull();
    expect(sanitizeScore(3.5)).toBeNull();
    expect(sanitizeScore('abc')).toBeNull();
    expect(sanitizeScore(null)).toBeNull();
    expect(sanitizeScore(undefined)).toBeNull();
    expect(sanitizeScore(NaN)).toBeNull();
  });
});

describe('sanitizeName', () => {
  it('通常の名前はそのまま（前後空白は除去）', () => {
    expect(sanitizeName('たろう')).toBe('たろう');
    expect(sanitizeName('  さくら  ')).toBe('さくら');
  });

  it('空・空白のみ・非文字列は null（匿名）', () => {
    expect(sanitizeName('')).toBeNull();
    expect(sanitizeName('   ')).toBeNull();
    expect(sanitizeName(null)).toBeNull();
    expect(sanitizeName(123)).toBeNull();
  });

  it('MAX_NAME_LENGTH で切り詰める', () => {
    const long = 'あ'.repeat(MAX_NAME_LENGTH + 5);
    expect(sanitizeName(long)).toHaveLength(MAX_NAME_LENGTH);
  });

  it('制御文字（改行・タブ）は空白に潰す', () => {
    expect(sanitizeName('a\nb')).toBe('a b');
    expect(sanitizeName('a\tb')).toBe('a b');
  });

  it('ハイフンは名前の一部として残す（制御文字の範囲に含めない）', () => {
    expect(sanitizeName('a-b')).toBe('a-b');
  });
});

describe('rankForScore', () => {
  const entries = [{ score: 20 }, { score: 15 }, { score: 15 }, { score: 10 }];

  it('自分より高いスコアの数 + 1 が順位（同点は同順位）', () => {
    expect(rankForScore(entries, 20)).toBe(1);
    expect(rankForScore(entries, 15)).toBe(2); // 20より下、15と同点 → 2位
    expect(rankForScore(entries, 10)).toBe(4); // 20,15,15 の3人が上 → 4位
    expect(rankForScore(entries, 5)).toBe(5);  // 全員より下 → 5位
  });

  it('空のランキングでは1位', () => {
    expect(rankForScore([], 10)).toBe(1);
  });
});
