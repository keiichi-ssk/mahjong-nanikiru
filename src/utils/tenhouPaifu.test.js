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
  listSteps,
  snapshotAt,
  filterSteps,
  stepLabel,
  validatePaifu,
  defaultProblemTitle,
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

describe('listSteps / snapshotAt（局面を1手ずつ扱う）', () => {
  it('打牌の直前と直後が交互に並ぶ', () => {
    const steps = listSteps(paifu, 0);
    // 最初は親（東1局なのでプレイヤー0）のツモ → その打牌
    expect(steps[0]).toMatchObject({ index: 0, player: 0, wind: '東', kind: 'tsumo', turn: 1 });
    expect(steps[1]).toMatchObject({ index: 1, player: 0, wind: '東', kind: 'discard' });
    // 打牌の直前ステップは「この後何を切るか」を持つ
    expect(steps[0].nextDiscard).toBe(steps[1].tile);
  });

  it('鳴いた直後は call になり、その家に手番が移る', () => {
    const steps = listSteps(paifu, 0);
    const call = steps.find(s => s.kind === 'call');
    // 東1局はプレイヤー1が 8m をポンしている
    expect(call).toMatchObject({ player: 1, kind: 'call', tile: '8m' });
    // 鳴いた直後は打牌の直前でもある
    expect(call.turn).toBeGreaterThan(0);
    expect(call.nextDiscard).not.toBeNull();
  });

  it('リーチ宣言の打牌には印が付く', () => {
    const declared = listSteps(paifu, 1).filter(s => s.kind === 'discard' && s.riichi);
    // 東1局1本場は2人がリーチしている（北家が先、次に南家）。
    // 南家は r60 ＝ リーチしてツモ切りなので、60 が直前のツモ牌に解決されている
    expect(declared.map(s => [s.player, s.tile])).toEqual([[3, '7s'], [1, '4m']]);
  });

  it('状態そのもの（内部データ）は外に出さない', () => {
    expect(listSteps(paifu, 0)[0]).not.toHaveProperty('state');
  });

  it('存在しない局は空', () => {
    expect(listSteps(paifu, 99)).toEqual([]);
    expect(listSteps(null, 0)).toEqual([]);
  });

  // ★ 視点（seat）はステップの player とは独立。
  //   「他家が切った瞬間を自分の視点で見る」ために必要
  it('同じ局面を別の席の視点で見られる', () => {
    const steps = listSteps(paifu, 0);
    const i = steps.findIndex(s => s.kind === 'discard' && s.player === 0);

    const fromEast  = snapshotToProblem(snapshotAt(paifu, 0, i, { seat: 0 }).snapshot);
    const fromSouth = snapshotToProblem(snapshotAt(paifu, 0, i, { seat: 1 }).snapshot);

    expect(fromEast.jikaze).toBe('東');
    expect(fromSouth.jikaze).toBe('南');
    // 手牌は視点ごとに変わるが、河（盤面）は同じ
    expect(fromEast.tiles).not.toEqual(fromSouth.tiles);
    expect(fromEast.otherDiscards).toEqual(fromSouth.otherDiscards);
  });

  // 他家の打牌直後は「鳴くか」を問える局面。切られた牌が discardedTile に入る
  it('打牌の直後の局面では切られた牌が discardedTile になる', () => {
    const steps = listSteps(paifu, 0);
    const i = steps.findIndex(s => s.kind === 'discard' && s.player === 0);
    const p = snapshotToProblem(snapshotAt(paifu, 0, i, { seat: 1 }).snapshot);

    expect(p.discardedTile).toBe(steps[i].tile);
    // 切った直後なので、まだツモっていない自分の手牌は13枚
    expect(p.tiles).toHaveLength(13);
  });

  it('自分のツモ番の局面では discardedTile は入らない', () => {
    const p = snapshotToProblem(snapshotAt(paifu, 0, 0, { seat: 0 }).snapshot);
    expect(p.discardedTile).toBeNull();
    expect(p.tiles).toHaveLength(14);
  });

  it('存在しないステップは null', () => {
    expect(snapshotAt(paifu, 0, 9999, { seat: 0 })).toBeNull();
    expect(snapshotAt(paifu, 99, 0, { seat: 0 })).toBeNull();
  });
});

describe('filterSteps / stepLabel（画面の絞り込みと説明）', () => {
  const steps = () => listSteps(paifu, 0);

  // 既定の「自分の手番」は何切るを作る使い方。ツモと鳴きの直後だけが残る
  it('自分の手番はツモ・鳴きの直後だけ', () => {
    const list = filterSteps(steps(), 'self', 1);
    expect(list.every(s => s.player === 1 && s.kind !== 'discard')).toBe(true);
    expect(list.some(s => s.kind === 'call')).toBe(true);   // ポンしている
  });

  it('他家の打牌は自分以外が切った直後だけ', () => {
    const list = filterSteps(steps(), 'other', 1);
    expect(list.every(s => s.player !== 1 && s.kind === 'discard')).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it('すべてはそのまま返す', () => {
    expect(filterSteps(steps(), 'all', 0)).toHaveLength(steps().length);
  });

  it('局面の説明を作る', () => {
    const list = steps();
    const tsumo = list.find(s => s.kind === 'tsumo' && s.player === 0);
    expect(stepLabel(tsumo, 0)).toBe(`${tsumo.junme}巡目 ツモ`);

    const call = list.find(s => s.kind === 'call');
    expect(stepLabel(call, call.player)).toContain('鳴き');

    const discard = list.find(s => s.kind === 'discard' && s.player === 0);
    expect(stepLabel(discard, 1)).toBe('東家 打');   // 他家から見た表記
    expect(stepLabel(discard, 0)).toBe('自分 打');
    expect(stepLabel(null, 0)).toBe('');
  });
});

describe('validatePaifu（読み込めるかの判定）', () => {
  it('取り込んだ牌譜は読める', () => {
    expect(validatePaifu(paifu)).toEqual({ ok: true });
  });

  it('牌譜でない JSON を弾く', () => {
    expect(validatePaifu(null).ok).toBe(false);
    expect(validatePaifu([1, 2, 3]).ok).toBe(false);
    expect(validatePaifu({ hello: 'world' }).ok).toBe(false);
    expect(validatePaifu({ log: [] }).ok).toBe(false);
  });

  // 再生は4人麻雀前提。3人麻雀は1局の要素数も席と風の対応も違う
  it('3人麻雀の牌譜を弾く', () => {
    expect(validatePaifu({ ...paifu, name: ['A', 'B', 'C'] }).ok).toBe(false);
    const threePlayerRound = paifu.log[0].slice(0, 14);
    expect(validatePaifu({ ...paifu, log: [threePlayerRound] }).ok).toBe(false);
  });

  it('弾いたときは画面に出せる理由を返す', () => {
    expect(validatePaifu({ ...paifu, name: ['A', 'B', 'C'] }).reason).toContain('4人麻雀');
  });
});

describe('defaultProblemTitle', () => {
  it('局と巡目からタイトルを作る', () => {
    expect(defaultProblemTitle(paifu, 0, 9)).toBe('東1局 9巡目');
    expect(defaultProblemTitle(paifu, 4, 3)).toBe('東3局 2本場 3巡目');
  });

  it('存在しない局なら空', () => {
    expect(defaultProblemTitle(paifu, 99, 1)).toBe('');
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
