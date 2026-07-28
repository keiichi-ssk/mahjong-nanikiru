import { describe, it, expect } from 'vitest';
import {
  WINDS,
  parseTileNotation,
  makeEmptySeat,
  makeBoardSnapshot,
  snapshotToProblem,
  snapshotFromHandText,
} from './importBoard';

describe('parseTileNotation（牌姿テキストの解析）', () => {
  it('スーツ文字までの数字にそのスーツを付ける', () => {
    expect(parseTileNotation('23467m234p234888s')).toEqual([
      '2m', '3m', '4m', '6m', '7m',
      '2p', '3p', '4p',
      '2s', '3s', '4s', '8s', '8s', '8s',
    ]);
  });

  it('字牌も読める', () => {
    expect(parseTileNotation('1122z567z')).toEqual(['1z', '1z', '2z', '2z', '5z', '6z', '7z']);
  });

  // 赤5は 0m / 0p / 0s
  it('数牌の 0 は赤5として通す', () => {
    expect(parseTileNotation('0m0p0s')).toEqual(['0m', '0p', '0s']);
  });

  // 存在しない牌を通すと牌画像が無いまま手牌に混ざる（移設時に足した振る舞い）
  it('存在しない字牌（0z / 8z / 9z）は捨てる', () => {
    expect(parseTileNotation('0z8z9z')).toEqual([]);
    expect(parseTileNotation('1890z')).toEqual(['1z']);
  });

  it('認識できない文字は読み飛ばす', () => {
    expect(parseTileNotation(' 12m / 34p ')).toEqual(['1m', '2m', '3p', '4p']);
    expect(parseTileNotation('１２m')).toEqual([]); // 全角数字は数字として扱わない
  });

  it('スーツ文字が来ないまま終わった数字は捨てる', () => {
    expect(parseTileNotation('12m34')).toEqual(['1m', '2m']);
  });

  it('文字列以外・空文字は空配列', () => {
    expect(parseTileNotation('')).toEqual([]);
    expect(parseTileNotation(null)).toEqual([]);
    expect(parseTileNotation(undefined)).toEqual([]);
  });
});

describe('makeBoardSnapshot', () => {
  it('未指定の項目は未設定（null）で埋まり、4家ぶんの席が必ずある', () => {
    const s = makeBoardSnapshot();
    expect(s.bakaze).toBeNull();
    expect(s.jikaze).toBeNull();
    expect(s.scores).toBeNull();
    expect(Object.keys(s.seats)).toEqual(WINDS);
    expect(s.seats.東).toEqual(makeEmptySeat());
  });

  it('渡した席は既定値とマージされる（渡さなかった項目は空のまま）', () => {
    const s = makeBoardSnapshot({ seats: { 南: { hand: ['1m'] } } });
    expect(s.seats.南).toEqual({ hand: ['1m'], melds: [], discards: [], riichiIndex: null });
    expect(s.seats.北).toEqual(makeEmptySeat());
  });
});

describe('snapshotToProblem（BoardSnapshot → problem）', () => {
  it('手牌は自風の席から取り、並べ替えられる', () => {
    const p = snapshotToProblem({
      jikaze: '西',
      seats: { 西: { hand: ['9s', '1m', '5z'] }, 東: { hand: ['1p'] } },
    });
    expect(p.tiles).toEqual(['1m', '9s', '5z']);
  });

  it('自風が未設定なら手牌の持ち主を決められないので空になる', () => {
    const p = snapshotToProblem({ seats: { 南: { hand: ['1m', '2m'] } } });
    expect(p.tiles).toEqual([]);
    expect(p.melds).toEqual([]);
  });

  // BoardSnapshot は「誰から鳴いたか」を絶対風で持ち、problem は相対位置で持つ
  it('副露の「鳴いた元」が絶対風から相対位置に変換される', () => {
    const p = snapshotToProblem({
      jikaze: '南',
      seats: {
        南: {
          hand: ['1m'],
          melds: [
            { type: 'pon', tiles: ['5z', '5z', '5z'], from: '東' }, // 南から見た東は上家
            { type: 'pon', tiles: ['1p', '1p', '1p'], from: '西' }, // 南から見た西は下家
            { type: 'pon', tiles: ['9s', '9s', '9s'], from: '北' }, // 南から見た北は対面
          ],
        },
      },
    });
    expect(p.melds.map(m => m.from)).toEqual(['上家', '下家', '対面']);
  });

  it('暗槓は鳴いた元を持たない', () => {
    const p = snapshotToProblem({
      jikaze: '東',
      seats: { 東: { hand: [], melds: [{ type: 'ankan', tiles: ['5m', '5m', '5m', '5m'], from: null }] } },
    });
    expect(p.melds[0].from).toBeNull();
  });

  // チーは上家からしかできないので、ほかの家が入っていても normalizeMelds が矯正する
  it('チーは鳴いた元が上家に矯正される', () => {
    const p = snapshotToProblem({
      jikaze: '東',
      seats: { 東: { melds: [{ type: 'chi', tiles: ['3m', '4m', '5m'], from: '西' }] } },
    });
    expect(p.melds[0].from).toBe('上家');
  });

  it('副露の順（鳴いた順）と牌はそのまま保たれる', () => {
    const melds = [
      { type: 'chi', tiles: ['3m', '4m', '5m'], from: '北' },
      { type: 'kan', tiles: ['2p', '2p', '2p', '2p'], from: '南' },
    ];
    const p = snapshotToProblem({ jikaze: '東', seats: { 東: { melds } } });
    expect(p.melds.map(m => m.tiles)).toEqual([['3m', '4m', '5m'], ['2p', '2p', '2p', '2p']]);
  });

  describe('otherDiscards', () => {
    it('捨て牌がある家だけを東南西北の順に並べる（自分も含む）', () => {
      const p = snapshotToProblem({
        jikaze: '南',
        seats: {
          東: { discards: ['1z', '9p'] },
          南: { discards: ['5s'] },          // 自分の河も保存対象（2026-07-27〜）
          西: { melds: [{ type: 'pon', tiles: ['1p', '1p', '1p'], from: '東' }] }, // 副露だけ＝保存しない
        },
      });
      expect(p.otherDiscards.map(od => od.player)).toEqual(['東', '南']);
    });

    // 自分の副露を持つのは problem.melds だけ。両方に入れると
    // collectCalledTiles（鳴かれた牌の集計）が二重に数える
    it('自分のブロックには副露を入れない（河だけを持たせる）', () => {
      const melds = [{ type: 'pon', tiles: ['1p', '1p', '1p'], from: '東' }];
      const p = snapshotToProblem({
        jikaze: '南',
        seats: { 南: { hand: ['1m'], melds, discards: ['5s'] } },
      });
      expect(p.melds).toHaveLength(1);
      expect(p.otherDiscards).toEqual([
        { player: '南', tiles: ['5s'], riichiIndex: null, melds: [] },
      ]);
    });

    it('リーチ宣言牌の位置と副露が引き継がれる（副露は相対位置に変換される）', () => {
      const p = snapshotToProblem({
        jikaze: '東',
        seats: {
          西: {
            discards: ['1z', '2z', '3m'],
            riichiIndex: 2,
            melds: [{ type: 'pon', tiles: ['7z', '7z', '7z'], from: '北' }], // 西から見た北は下家
          },
        },
      });
      expect(p.otherDiscards).toEqual([{
        player: '西',
        tiles: ['1z', '2z', '3m'],
        riichiIndex: 2,
        melds: [{ type: 'pon', tiles: ['7z', '7z', '7z'], from: '下家' }],
      }]);
    });

    it('捨て牌がどの家にも無ければ null', () => {
      expect(snapshotToProblem({ jikaze: '東' }).otherDiscards).toBeNull();
    });
  });

  describe('scores', () => {
    it('持ち点と供託が1つのオブジェクトにまとまる', () => {
      const p = snapshotToProblem({
        scores: { 東: 30000, 南: 25000, 西: 24000, 北: 21000 },
        kyotaku: 1000,
      });
      expect(p.scores).toEqual({ 東: 30000, 南: 25000, 西: 24000, 北: 21000, kyotaku: 1000 });
    });

    it('供託だけでも scores になり、欠けた家は 0 になる', () => {
      expect(snapshotToProblem({ kyotaku: 2000 }).scores)
        .toEqual({ 東: 0, 南: 0, 西: 0, 北: 0, kyotaku: 2000 });
    });

    it('持ち点も供託も無ければ未設定（null）', () => {
      expect(snapshotToProblem({}).scores).toBeNull();
    });
  });

  it('状況設定はそのまま乗る', () => {
    const p = snapshotToProblem({
      bakaze: '南', kyoku: 3, honba: 2, junme: 11, jikaze: '北', dora: '4z',
    });
    expect(p).toMatchObject({ bakaze: '南', kyoku: 3, honba: 2, junme: 11, jikaze: '北', dora: '4z' });
  });

  // ゴールデンテスト。BoardSnapshot にフィールドを足したとき problem への反映を忘れると落ちる。
  // 意図的に変換しないフィールドを作る場合もこの表に理由とともに書くこと
  const SNAPSHOT_FIELD_TARGETS = {
    bakaze:      'problem.bakaze',
    kyoku:       'problem.kyoku',
    honba:       'problem.honba',
    junme:       'problem.junme',
    jikaze:      'problem.jikaze',
    dora:        'problem.dora',
    kyotaku:     'problem.scores.kyotaku',
    scores:      'problem.scores',
    seats:       'problem.tiles / melds / otherDiscards',
    lastDiscard: 'problem.discardedTile',
  };
  const SEAT_FIELD_TARGETS = {
    hand:        '自風の席 → problem.tiles',
    melds:       '自風の席 → problem.melds / ほかの家 → otherDiscards[].melds',
    discards:    'problem.otherDiscards[].tiles',
    riichiIndex: 'problem.otherDiscards[].riichiIndex',
  };

  it('BoardSnapshot の全フィールドに変換先がある', () => {
    expect(Object.keys(makeBoardSnapshot()).filter(k => !(k in SNAPSHOT_FIELD_TARGETS))).toEqual([]);
    expect(Object.keys(makeEmptySeat()).filter(k => !(k in SEAT_FIELD_TARGETS))).toEqual([]);
  });

  it('全フィールドを埋めた盤面が problem に反映される', () => {
    const p = snapshotToProblem({
      bakaze: '東', kyoku: 1, honba: 3, junme: 8, jikaze: '南', dora: '4z',
      kyotaku: 1000,
      scores: { 東: 25000, 南: 26000, 西: 24000, 北: 25000 },
      seats: {
        東: { discards: ['1z'], riichiIndex: 0 },
        南: {
          hand: ['3m', '1m', '2m'],
          melds: [{ type: 'pon', tiles: ['6z', '6z', '6z'], from: '北' }],
          discards: ['9p'],
        },
      },
    });
    expect(p).toEqual({
      tiles: ['1m', '2m', '3m'],
      melds: [{ type: 'pon', tiles: ['6z', '6z', '6z'], from: '対面' }],
      dora: '4z',
      bakaze: '東',
      kyoku: 1,
      honba: 3,
      jikaze: '南',
      junme: 8,
      scores: { 東: 25000, 南: 26000, 西: 24000, 北: 25000, kyotaku: 1000 },
      otherDiscards: [
        { player: '東', tiles: ['1z'], riichiIndex: 0, melds: [] },
        { player: '南', tiles: ['9p'], riichiIndex: null, melds: [] },
      ],
      discardedTile: null,
    });
  });

  // 他家が牌を切った直後の局面（鳴くか・押すかを問う）では、その牌が
  // problem.discardedTile になり naki-timing / naki-choice で使える
  describe('lastDiscard', () => {
    it('直前に切られた牌が discardedTile になる', () => {
      const p = snapshotToProblem({
        jikaze: '東',
        lastDiscard: { wind: '南', tile: '3s' },
        seats: { 東: { hand: ['1m'] } },
      });
      expect(p.discardedTile).toBe('3s');
    });

    it('自分のツモ番の局面（未設定）では null', () => {
      expect(snapshotToProblem({ jikaze: '東' }).discardedTile).toBeNull();
    });
  });
});

describe('snapshotFromHandText（牌姿テキストのアダプタ）', () => {
  it('手牌が自風の席に入る', () => {
    const s = snapshotFromHandText('123m', { jikaze: '東' });
    expect(s.seats.東.hand).toEqual(['1m', '2m', '3m']);
    expect(s.jikaze).toBe('東');
  });

  it('自風を省くと南家として扱う', () => {
    expect(snapshotFromHandText('123m').seats.南.hand).toEqual(['1m', '2m', '3m']);
  });

  it('状況設定はそのまま渡せる', () => {
    const p = snapshotToProblem(snapshotFromHandText('23467m234p234888s', { junme: 9, dora: '4z' }));
    expect(p.tiles).toHaveLength(14);
    expect(p.junme).toBe(9);
    expect(p.dora).toBe('4z');
  });
});
