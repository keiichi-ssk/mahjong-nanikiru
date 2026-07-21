import { describe, it, expect } from 'vitest';
import { generateChinitsuHand, analyzeDiscard, computeBestDiscards, judgeChinitsu, isWinningHand } from './chinitsuUtils';

describe('generateChinitsuHand', () => {
  it('筒子1p〜9pのみ・14枚・各牌4枚以内で生成される', () => {
    for (let i = 0; i < 20; i++) {
      const hand = generateChinitsuHand();
      expect(hand).toHaveLength(14);
      expect(hand.every(t => /^[1-9]p$/.test(t))).toBe(true);
      const counts = {};
      hand.forEach(t => { counts[t] = (counts[t] ?? 0) + 1; });
      expect(Object.values(counts).every(c => c <= 4)).toBe(true);
    }
  });
});

describe('analyzeDiscard', () => {
  it('両面待ち（4p/7p）を正しく算出する', () => {
    // 1p1p(頭予備) 2p2p2p 5p6p(リャンメン) 8p8p8p 9p9p9p + 捨て牌3p
    const hand14 = ['1p', '1p', '2p', '2p', '2p', '3p', '5p', '6p', '8p', '8p', '8p', '9p', '9p', '9p'];
    const result = analyzeDiscard(hand14, '3p');
    expect(result.isTenpai).toBe(true);
    expect(result.waits).toEqual(['4p', '7p']);
    expect(result.ukeire).toBe(8); // 4p:4枚 + 7p:4枚（手牌に0枚のため満数）
    expect(result.value).toBe(2); // 刻子が2p・8p・9pの3組(三暗刻)で、順子は1組のみのためピンフは付かない
  });

  it('シャンポン待ちを正しく算出する', () => {
    // 1p1p1p 3p3p3p 5p5p5p 7p7p7p 9p9p（4面子+1対子=完成形）から1pを1枚切る
    const hand14 = ['1p', '1p', '1p', '3p', '3p', '3p', '5p', '5p', '5p', '7p', '7p', '7p', '9p', '9p'];
    const result = analyzeDiscard(hand14, '1p');
    expect(result.isTenpai).toBe(true);
    expect(result.waits).toEqual(['1p', '9p']);
    expect(result.ukeire).toBe(4); // 1p:残り2枚 + 9p:残り2枚
  });

  it('暗刻+2つ先の孤立牌が作る隠れた複合待ちを正しく算出する', () => {
    // 同じ手牌から9pを1枚切ると 1p1p1p 3p3p3p 5p5p5p 7p7p7p 9p(単騎に見える)。
    // 一見9p単騎だが、7p7p7pの2枚を頭に回し7p8p9pの順子を作る手順があるため
    // 実際は8p/9pの2種待ち（単騎読みは見落としがちな典型パターン）
    const hand14 = ['1p', '1p', '1p', '3p', '3p', '3p', '5p', '5p', '5p', '7p', '7p', '7p', '9p', '9p'];
    const result = analyzeDiscard(hand14, '9p');
    expect(result.isTenpai).toBe(true);
    expect(result.waits).toEqual(['8p', '9p']);
    expect(result.ukeire).toBe(7); // 8p:手牌0枚→残り4枚 + 9p:手牌1枚→残り3枚
  });

  it('七対子（6対子+1枚）のテンパイを正しく算出する', () => {
    // 1p1p 2p2p 3p3p 5p5p 7p7p 9p9p（6対子）+ 4p単騎 + 捨て牌6p
    const hand14 = ['1p', '1p', '2p', '2p', '3p', '3p', '4p', '5p', '5p', '6p', '7p', '7p', '9p', '9p'];
    const result = analyzeDiscard(hand14, '6p');
    expect(result.isTenpai).toBe(true);
    expect(result.waits).toEqual(['4p']);
    expect(result.ukeire).toBe(3); // 4pは手牌に1枚残っているため残り3枚
  });

  it('どの牌が来ても完成しない手はノーテン', () => {
    // 1p1p 3p3p 5p5p 7p7p 9p9p（5対子）+ 2p 4p 6p（孤立した単独牌3枚）+ 捨て牌1p
    // 七対子には対子が1つ足りず、単独牌3枚も互いに離れていて面子化できない
    const hand14 = ['1p', '1p', '1p', '3p', '3p', '5p', '5p', '7p', '7p', '9p', '9p', '2p', '4p', '6p'];
    const result = analyzeDiscard(hand14, '1p');
    expect(result.isTenpai).toBe(false);
    expect(result.waits).toEqual([]);
    expect(result.ukeire).toBe(0);
  });
});

describe('isWinningHand', () => {
  it('4面子+1雀頭の完成形はアガリと判定する', () => {
    const hand14 = ['1p', '1p', '1p', '3p', '3p', '3p', '5p', '5p', '5p', '7p', '7p', '7p', '9p', '9p'];
    expect(isWinningHand(hand14)).toBe(true);
  });

  it('七対子（7組の対子）の完成形はアガリと判定する', () => {
    const hand14 = ['1p', '1p', '2p', '2p', '3p', '3p', '4p', '4p', '5p', '5p', '6p', '6p', '7p', '7p'];
    expect(isWinningHand(hand14)).toBe(true);
  });

  it('テンパイ止まりの手はアガリと判定しない', () => {
    const hand14 = ['1p', '1p', '2p', '2p', '2p', '3p', '5p', '6p', '8p', '8p', '8p', '9p', '9p', '9p'];
    expect(isWinningHand(hand14)).toBe(false);
  });
});

describe('computeBestDiscards', () => {
  it('受け入れ枚数が最大になる打牌を求める（シャンポンより広い隠れた待ちを優先する）', () => {
    // 1p1p1p 3p3p3p 5p5p5p 7p7p7p 9p9p（完成形）。
    // 1p/3p/5p/7pを切るとシャンポン(受け入れ4)、9pを切ると
    // 7p7p7pの1枚を順子に転用できる隠れた複合待ち8p/9p(受け入れ7)になり、9pが最善
    const hand14 = ['1p', '1p', '1p', '3p', '3p', '3p', '5p', '5p', '5p', '7p', '7p', '7p', '9p', '9p'];
    const { maxUkeire, bestTiles } = computeBestDiscards(hand14);
    expect(maxUkeire).toBe(7);
    expect(bestTiles).toEqual(['9p']);
  });

  it('一見ノーテンに見える打牌より、待ちが広い打牌が他にあればそちらが最善になる', () => {
    // 1p1p1p 2p2p2p 3p3p3p 5p5p5p5p 9p。
    // 5pを切ると9p単騎(受け入れ3)止まりだが、9pを切ると
    // 1p2p3pの並びと5p5p5p5pの余剰を使った隠れた4p待ち(受け入れ4)になり、こちらが最善
    const hand14b = ['1p', '1p', '1p', '2p', '2p', '2p', '3p', '3p', '3p', '5p', '5p', '5p', '5p', '9p'];
    const { maxUkeire, bestTiles } = computeBestDiscards(hand14b);
    expect(maxUkeire).toBe(4);
    expect(bestTiles).toEqual(['9p']);
  });

  it('受け入れ枚数が同点の場合、役が高い方の打牌に絞り込む', () => {
    // 5pを切っても7pを切っても受け入れ5枚でタイするが、
    // 7pを切った方が役の高い待ち（value2）になるため7pのみが正解になる
    const hand14c = ['1p', '2p', '3p', '3p', '4p', '5p', '5p', '7p', '7p', '7p', '8p', '8p', '9p', '9p'];
    const discard5p = analyzeDiscard(hand14c, '5p');
    const discard7p = analyzeDiscard(hand14c, '7p');
    expect(discard5p.ukeire).toBe(5);
    expect(discard7p.ukeire).toBe(5);
    expect(discard5p.value).toBeLessThan(discard7p.value);

    const { maxUkeire, bestTiles } = computeBestDiscards(hand14c);
    expect(maxUkeire).toBe(5);
    expect(bestTiles).toEqual(['7p']);
  });
});

describe('judgeChinitsu', () => {
  const hand14 = ['1p', '1p', '1p', '3p', '3p', '3p', '5p', '5p', '5p', '7p', '7p', '7p', '9p', '9p'];

  it('最善の打牌＋待ちの過不足ない選択で正解', () => {
    expect(judgeChinitsu(hand14, '9p', 'tenpai', ['8p', '9p'])).toBe(true);
  });

  it('待ちの選択に過不足があれば不正解', () => {
    expect(judgeChinitsu(hand14, '9p', 'tenpai', ['9p'])).toBe(false); // 選び漏れ（8pが抜けている）
    expect(judgeChinitsu(hand14, '9p', 'tenpai', ['8p', '9p', '1p'])).toBe(false); // 選びすぎ
  });

  it('テンパイなのにノーテンと回答すれば不正解', () => {
    expect(judgeChinitsu(hand14, '9p', 'noten', [])).toBe(false);
  });

  it('打牌自体が最善でなければ、待ちの判断が合っていても不正解', () => {
    // 1pを切るとシャンポン(受け入れ4)にしかならず、9pを切る場合の複合待り(受け入れ7)より劣る
    expect(judgeChinitsu(hand14, '1p', 'tenpai', ['1p', '9p'])).toBe(false);
  });

  it('一見良さそうな打牌でも、より受け入れの広い打牌が他にあれば不正解', () => {
    const hand14b = ['1p', '1p', '1p', '2p', '2p', '2p', '3p', '3p', '3p', '5p', '5p', '5p', '5p', '9p'];
    // 5pを切る（9p単騎・受け入れ3）は一見自然だが、9pを切る（4p待ち・受け入れ4）の方が広い
    expect(judgeChinitsu(hand14b, '5p', 'tenpai', ['9p'])).toBe(false);
    expect(judgeChinitsu(hand14b, '9p', 'tenpai', ['4p'])).toBe(true);
  });
});
