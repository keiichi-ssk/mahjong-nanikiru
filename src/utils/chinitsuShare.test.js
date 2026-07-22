import { describe, it, expect } from 'vitest';
import { handToNotation, encodeHandParam, decodeHandParam, buildShareUrl } from './chinitsuShare';

const HAND_M = ['1m', '1m', '2m', '3m', '4m', '5m', '5m', '6m', '7m', '8m', '9m', '9m', '9m', '9m'];

describe('handToNotation', () => {
  it('萬子は漢数字になる', () => {
    expect(handToNotation(HAND_M)).toBe('一一二三四五五六七八九九九九');
  });

  it('筒子は丸数字・索子は全角数字になる', () => {
    expect(handToNotation(['1p', '5p', '9p'])).toBe('①⑤⑨');
    expect(handToNotation(['1s', '5s', '9s'])).toBe('１５９');
  });
});

describe('encodeHandParam / decodeHandParam', () => {
  it('encode → decode で同じ手牌に戻る（往復対称性）', () => {
    const encoded = encodeHandParam(HAND_M);
    expect(encoded).toBe('11234556789999m');

    const decoded = decodeHandParam(encoded);
    expect(decoded).toEqual(HAND_M);
  });

  it('decode はソート済みの手牌を返す', () => {
    expect(decodeHandParam('99999123455678m')).toBeNull(); // 9が5枚 → 不正
    expect(decodeHandParam('91234556789919p')).toEqual(
      ['1p', '1p', '2p', '3p', '4p', '5p', '5p', '6p', '7p', '8p', '9p', '9p', '9p', '9p']
    );
  });

  it('不正なパラメータは null を返す', () => {
    expect(decodeHandParam(null)).toBeNull();
    expect(decodeHandParam('')).toBeNull();
    expect(decodeHandParam('1123455678999')).toBeNull(); // スーツ欠落
    expect(decodeHandParam('1123455678999z')).toBeNull(); // 不正スーツ
    expect(decodeHandParam('112345567899m')).toBeNull(); // 13枚
    expect(decodeHandParam('0123455678999m')).toBeNull(); // 0は不正（赤5は対象外）
    expect(decodeHandParam('11111234556789m')).toBeNull(); // 1が5枚
  });
});

describe('buildShareUrl', () => {
  it('Web IntentのURLに/api/share経由のリンク（?q=）とハッシュタグが含まれる', () => {
    const url = buildShareUrl(HAND_M);
    expect(url).toMatch(/^https:\/\/twitter\.com\/intent\/tweet\?text=/);
    expect(decodeURIComponent(url)).toContain('api/share?q=11234556789999m');
    expect(decodeURIComponent(url)).toContain('#メンチン何切るドリル');
    expect(decodeURIComponent(url)).toContain('一一二三四五五六七八九九九九');
  });
});
