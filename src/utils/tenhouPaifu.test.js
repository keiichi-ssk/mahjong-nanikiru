import { describe, it, expect } from 'vitest';
import {
  parseTenhouTile,
  parseTenhouTiles,
  parseMeldString,
  splitKyoku,
  playerWind,
  listRounds,
  countTurns,
  replayRound,
} from './tenhouPaifu';
import { snapshotToProblem } from './importBoard';

// 実際に雀魂から取り込んだ牌譜（対局者名だけ伏せたもの）。
// 5局ぶんで、上家/下家/対面からのポン・チー・加槓・リーチ・赤5・カンドラを含む。
// tools-local/majsoul-save-tenhou.user.js が出力した形式そのもの
import paifu from './__fixtures__/tenhou-sample.json';

describe('parseTenhouTile（牌番号 → 牌コード）', () => {
  it('数牌と字牌を変換する', () => {
    expect(parseTenhouTile(11)).toBe('1m');
    expect(parseTenhouTile(19)).toBe('9m');
    expect(parseTenhouTile(24)).toBe('4p');
    expect(parseTenhouTile(33)).toBe('3s');
    expect(parseTenhouTile(41)).toBe('1z'); // 東
    expect(parseTenhouTile(47)).toBe('7z'); // 中
  });

  // 51/52/53 は赤5。アプリ側は 0m/0p/0s
  it('赤5を変換する', () => {
    expect(parseTenhouTile(51)).toBe('0m');
    expect(parseTenhouTile(52)).toBe('0p');
    expect(parseTenhouTile(53)).toBe('0s');
  });

  it('存在しない牌は null', () => {
    expect(parseTenhouTile(48)).toBeNull(); // 字牌は7まで
    expect(parseTenhouTile(10)).toBeNull();
    expect(parseTenhouTile(54)).toBeNull();
    expect(parseTenhouTile(60)).toBeNull(); // ツモ切りの印は牌ではない
    expect(parseTenhouTile('x')).toBeNull();
  });

  it('配列は変換できないものを落とす', () => {
    expect(parseTenhouTiles([11, 99, 52])).toEqual(['1m', '0p']);
    expect(parseTenhouTiles(null)).toEqual([]);
  });
});

describe('parseMeldString（副露文字列）', () => {
  // 鳴いた相手は「記号の位置」で決まる（先頭=上家 / 中=対面 / 末尾=下家）。
  // 以下はすべてフィクスチャの牌譜に実在する表記
  it('記号の位置で鳴いた相手が決まる', () => {
    expect(parseMeldString('p181818')).toMatchObject({ type: 'pon', fromRelative: '上家', calledIndex: 0 });
    expect(parseMeldString('44p4444')).toMatchObject({ type: 'pon', fromRelative: '対面', calledIndex: 1 });
    expect(parseMeldString('1111p11')).toMatchObject({ type: 'pon', fromRelative: '下家', calledIndex: 2 });
  });

  it('チーは牌コードに変換され赤5も扱える', () => {
    expect(parseMeldString('c522324')).toMatchObject({
      type: 'chi', tiles: ['0p', '3p', '4p'], fromRelative: '上家',
    });
  });

  // 加槓は元のポンの記号位置を保ったまま牌が4枚になるため、
  // 「末尾なら下家」の一般則ではなく3枚のポンとして位置を見る
  it('加槓は元のポンと同じ相手になる', () => {
    expect(parseMeldString('4545p45')).toMatchObject({ type: 'pon', fromRelative: '下家' });
    expect(parseMeldString('4545k4545')).toMatchObject({
      type: 'kakan', tiles: ['5z', '5z', '5z', '5z'], fromRelative: '下家',
    });
  });

  it('暗槓は鳴いた相手を持たない', () => {
    expect(parseMeldString('111111a11')).toMatchObject({
      type: 'ankan', tiles: ['1m', '1m', '1m', '1m'], fromRelative: null,
    });
  });

  it('記号が無ければ null', () => {
    expect(parseMeldString('1111')).toBeNull();
    expect(parseMeldString('')).toBeNull();
  });
});

describe('局の情報', () => {
  it('局番号を場風と局に分ける', () => {
    expect(splitKyoku(0)).toEqual({ bakaze: '東', kyoku: 1 });
    expect(splitKyoku(3)).toEqual({ bakaze: '東', kyoku: 4 });
    expect(splitKyoku(4)).toEqual({ bakaze: '南', kyoku: 1 });
    expect(splitKyoku(8)).toEqual({ bakaze: '西', kyoku: 1 });
  });

  // 席順は固定で、親（局 % 4 のプレイヤー）が東になる
  it('プレイヤー番号と局から風を求める', () => {
    expect([0, 1, 2, 3].map(p => playerWind(p, 0))).toEqual(['東', '南', '西', '北']);
    expect([0, 1, 2, 3].map(p => playerWind(p, 1))).toEqual(['北', '東', '南', '西']);
    expect(playerWind(0, 4)).toBe('東'); // 南1局は親が一周してプレイヤー0に戻る
  });

  it('局の一覧を作る（本場は1以上のときだけラベルに出す）', () => {
    const rounds = listRounds(paifu);
    expect(rounds).toHaveLength(5);
    expect(rounds.map(r => r.label)).toEqual([
      '東1局', '東1局 1本場', '東2局', '東2局 1本場', '東3局 2本場',
    ]);
    expect(rounds[0].result).toBe('流局');
    expect(rounds[1].result).toBe('和了');
  });

  it('打牌の回数を数える（暗槓・加槓は数えない）', () => {
    expect(countTurns(paifu, 0, 0)).toBe(18);
    // 東3局2本場のプレイヤー1は加槓を1回しているが打牌としては数えない
    expect(countTurns(paifu, 4, 1)).toBe(8);
  });
});

describe('replayRound（局を再生して盤面を作る）', () => {
  it('打牌の直前＝手牌14枚の状態を返す', () => {
    const r = replayRound(paifu, 0, { seat: 0, turn: 1 });
    const p = snapshotToProblem(r.snapshot);
    expect(p.tiles).toHaveLength(14);
    expect(p.junme).toBe(1);
    expect(p.jikaze).toBe('東');       // 東1局のプレイヤー0は親
    expect(p.bakaze).toBe('東');
    expect(p.kyoku).toBe(1);
    expect(p.honba).toBe(0);
    expect(r.actualDiscard).toBe('4z');
    expect(r.riichiDeclared).toBe(false);
  });

  // 牌譜が持つのはドラ表示牌（3索）。problem.dora はドラそのものなので4索になる。
  // ★逆にすると全問題のドラが1つずれる
  it('ドラ表示牌をドラに直す', () => {
    const p = snapshotToProblem(replayRound(paifu, 0, { seat: 0, turn: 1 }).snapshot);
    expect(p.dora).toBe('4s');
  });

  it('その時点までの河が全員ぶん入る（自分の河も含む）', () => {
    const first = snapshotToProblem(replayRound(paifu, 0, { seat: 0, turn: 1 }).snapshot);
    expect(first.otherDiscards).toBeNull(); // 親の第1打牌前なので誰も切っていない

    const p = snapshotToProblem(replayRound(paifu, 0, { seat: 0, turn: 6 }).snapshot);
    expect(p.otherDiscards.map(od => [od.player, od.tiles.length])).toEqual([
      ['東', 5], ['南', 5], ['西', 5], ['北', 5],
    ]);
  });

  it('点数が風ごとに入る', () => {
    const p = snapshotToProblem(replayRound(paifu, 0, { seat: 0, turn: 1 }).snapshot);
    expect(p.scores).toEqual({ 東: 25000, 南: 25000, 西: 25000, 北: 25000, kyotaku: 0 });
  });

  // 牌譜の供託は「リーチ棒の本数」だが、このアプリの kyotaku は「点数」。
  // 変換を忘れると供託が 1点 で保存される
  it('供託は本数ではなく点数に直す', () => {
    // 東3局2本場は牌譜上 1本 ＝ 1000点
    const p = snapshotToProblem(replayRound(paifu, 4, { seat: 0, turn: 1 }).snapshot);
    expect(p.scores.kyotaku).toBe(1000);
  });

  describe('鳴き', () => {
    it('副露が手牌から引かれ、鳴いた相手が入る', () => {
      const r = replayRound(paifu, 0, { seat: 1, turn: 10 });
      const p = snapshotToProblem(r.snapshot);
      expect(p.melds).toEqual([{ type: 'pon', tiles: ['8m', '8m', '8m'], from: '上家' }]);
      expect(p.tiles).toHaveLength(11); // 13 - 3(副露) + 1(ツモ) = 11
    });

    // 鳴くと打牌の回数が1回増えるので、巡目（ツモ回数）とはズレる
    it('巡目は打牌回数ではなくツモ回数', () => {
      const p = snapshotToProblem(replayRound(paifu, 0, { seat: 1, turn: 10 }).snapshot);
      expect(p.junme).toBe(9);
    });

    // BoardSnapshot は絶対風で持ち、problem 側で相対位置に直る。
    // 東2局はプレイヤー1が東家なので、北家（プレイヤー0）は他家として入る
    it('他家の副露も鳴いた相手つきで入る', () => {
      const snap = replayRound(paifu, 2, { seat: 1, turn: countTurns(paifu, 2, 1) }).snapshot;
      expect(snap.seats.北.melds).toEqual([
        { type: 'pon', tiles: ['4z', '4z', '4z'], from: '南' },
        { type: 'pon', tiles: ['8s', '8s', '8s'], from: '西' },
      ]);
      // 席は東→南→西→北の順に下家方向へ進むので、北から見て 南=対面 / 西=上家
      const od = snapshotToProblem(snap).otherDiscards.find(o => o.player === '北');
      expect(od.melds.map(m => m.from)).toEqual(['対面', '上家']);
    });

    it('チーで鳴いた赤5が保たれる', () => {
      const p = snapshotToProblem(replayRound(paifu, 2, { seat: 2, turn: 18 }).snapshot);
      expect(p.melds).toEqual([{ type: 'chi', tiles: ['0p', '3p', '4p'], from: '上家' }]);
    });

    // 加槓は既存のポンを置き換える（副露が2組に増えない）。鳴いた相手も元のポンのまま
    it('加槓は元のポンを置き換える', () => {
      const before = snapshotToProblem(replayRound(paifu, 4, { seat: 1, turn: 7 }).snapshot);
      expect(before.melds).toEqual([{ type: 'pon', tiles: ['5z', '5z', '5z'], from: '下家' }]);

      const after = snapshotToProblem(replayRound(paifu, 4, { seat: 1, turn: 8 }).snapshot);
      expect(after.melds).toEqual([{ type: 'kakan', tiles: ['5z', '5z', '5z', '5z'], from: '下家' }]);
      expect(after.tiles).toHaveLength(11); // 副露は1組のままなので枚数は変わらない
    });
  });

  describe('リーチ', () => {
    it('宣言した打牌が分かる', () => {
      expect(replayRound(paifu, 1, { seat: 1, turn: 10 }).riichiDeclared).toBe(false);
      expect(replayRound(paifu, 1, { seat: 1, turn: 11 }).riichiDeclared).toBe(true);
    });

    // 'r60' は「リーチしてツモ切り」。60 を直前のツモ牌に解決できていないと牌が消える
    it('リーチのツモ切りが直前のツモ牌に解決される', () => {
      expect(replayRound(paifu, 1, { seat: 1, turn: 11 }).actualDiscard).toBe('4m');
    });

    it('河のどこが宣言牌かが入る', () => {
      const p = snapshotToProblem(replayRound(paifu, 1, { seat: 3, turn: countTurns(paifu, 1, 3) }).snapshot);
      const byPlayer = Object.fromEntries(p.otherDiscards.map(od => [od.player, od.riichiIndex]));
      expect(byPlayer).toEqual({ 東: null, 南: 10, 西: null, 北: 9 });
    });
  });

  it('最後の打牌かどうかが分かる（UIで「次へ」を無効にするため）', () => {
    expect(replayRound(paifu, 1, { seat: 1, turn: 11 }).isLast).toBe(false);
    expect(replayRound(paifu, 1, { seat: 1, turn: 12 }).isLast).toBe(true);
  });

  it('存在しない局・巡目は null', () => {
    expect(replayRound(paifu, 1, { seat: 1, turn: 99 })).toBeNull();
    expect(replayRound(paifu, 99, { seat: 0, turn: 1 })).toBeNull();
    expect(replayRound(null, 0, { seat: 0, turn: 1 })).toBeNull();
  });

  // ツモ切り（60）を解決できていないと手牌に残ったままになり枚数が合わなくなる。
  // 全局・全席・全巡目を通して手牌の枚数が破綻しないことを確認する
  it('全局・全席・全巡目で手牌の枚数が整合する', () => {
    for (let round = 0; round < paifu.log.length; round++) {
      for (let seat = 0; seat < 4; seat++) {
        for (let turn = 1; turn <= countTurns(paifu, round, seat); turn++) {
          const r = replayRound(paifu, round, { seat, turn });
          expect(r, `log[${round}] seat=${seat} turn=${turn}`).not.toBeNull();
          const p = snapshotToProblem(r.snapshot);
          // 手牌 ＝ 14 − 3×副露数（打牌直前なのでツモ牌を含む）
          expect(p.tiles.length, `log[${round}] seat=${seat} turn=${turn}`)
            .toBe(14 - 3 * p.melds.length);
          expect(r.actualDiscard).not.toBeNull();
        }
      }
    }
  });
});
