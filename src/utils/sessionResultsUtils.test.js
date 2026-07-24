import { describe, it, expect } from 'vitest';
import { shouldDeferResult, collectPendingUpgrades } from './sessionResultsUtils';

describe('shouldDeferResult', () => {
  it('開始時に不正解(false)で今回正解(true)なら保留する', () => {
    expect(shouldDeferResult({ 1: false }, 1, true)).toBe(true);
  });

  it('開始時に不正解でも今回不正解なら保留しない', () => {
    expect(shouldDeferResult({ 1: false }, 1, false)).toBe(false);
  });

  it('開始時に正解済み(true)なら今回正解でも保留しない（従来どおり即時記録）', () => {
    expect(shouldDeferResult({ 1: true }, 1, true)).toBe(false);
  });

  it('開始時に未登録（キーなし）なら今回正解でも保留しない（新規正解は即時記録）', () => {
    expect(shouldDeferResult({}, 1, true)).toBe(false);
    expect(shouldDeferResult({ 2: false }, 1, true)).toBe(false);
  });

  it('startSnapshot が未定義でも例外にならず保留しない', () => {
    expect(shouldDeferResult(undefined, 1, true)).toBe(false);
  });
});

describe('collectPendingUpgrades', () => {
  it('開始時不正解→今回正解の問題だけを拾う', () => {
    const start = { 1: false, 2: false, 3: true };
    const first = { 1: true, 2: false, 3: true, 4: true };
    // 1: 不正解→正解 = 対象 / 2: 不正解→不正解 = 除外 /
    // 3: 正解→正解 = 除外 / 4: 未登録→正解 = 除外
    expect(collectPendingUpgrades(start, first)).toEqual(['1']);
  });

  it('対象がなければ空配列', () => {
    expect(collectPendingUpgrades({ 1: true }, { 1: true })).toEqual([]);
    expect(collectPendingUpgrades({}, {})).toEqual([]);
  });

  it('複数の対象を拾える', () => {
    const start = { 1: false, 5: false, 9: false };
    const first = { 1: true, 5: true, 9: false };
    expect(collectPendingUpgrades(start, first).sort()).toEqual(['1', '5']);
  });

  it('sessionFirstResults が未定義でも空配列', () => {
    expect(collectPendingUpgrades({ 1: false }, undefined)).toEqual([]);
  });
});
