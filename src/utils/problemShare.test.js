import { describe, it, expect } from 'vitest';
import { encodeProblemParam, decodeProblemParam, SHARE_INTERNALS } from './problemShare';
import { MELD_TYPES } from './problemConstants';
import { replayRound } from './tenhouPaifu';
import { snapshotToProblem } from './importBoard';
import paifu from './__fixtures__/tenhou-sample.json';

// 出題に必要なフィールドが往復で保たれること。
// URL に載せ忘れると「共有先だけ盤面が欠ける」ので、ここで固定する
const full = {
  tiles: ['1m', '2m', '3m', '0p', '5p', '6p', '7s', '8s', '9s', '1z', '1z', '5z', '5z', '9m'],
  answer: '9m,ankan:5z',
  dora: '4z',
  riichi: false,
  problemType: 'default',
  discardedTile: '3p',
  nakiChoices: [{ tile: '3p', correct: true }, { tile: '6p', correct: false }],
  melds: [
    { type: 'pon', tiles: ['1z', '1z', '1z'], from: '対面' },
    { type: 'ankan', tiles: ['5s', '5s', '5s', '5s'], from: null },
  ],
  bakaze: '南',
  kyoku: 3,
  honba: 2,
  jikaze: '西',
  junme: 11,
  otherDiscards: [
    { player: '東', tiles: ['1p', '9m', '5z'], riichiIndex: 1, melds: [{ type: 'chi', tiles: ['3m', '4m', '5m'], from: '上家' }] },
    { player: '北', tiles: ['2s'], riichiIndex: null, melds: [] },
  ],
  scores: { 東: 25000, 南: 31200, 西: 18800, 北: 24000, kyotaku: 1000 },
  explanation: 'ここは[9m]切り。字牌は残す。',
  note: '相手のリーチ後',
  title: 'テスト問題',
};

describe('encodeProblemParam / decodeProblemParam', () => {
  it('出題に必要なフィールドが往復で保たれる', async () => {
    const decoded = await decodeProblemParam(await encodeProblemParam(full));
    for (const key of Object.keys(full)) {
      expect(decoded[key], key).toEqual(full[key]);
    }
  });

  it('共有された問題は盤面表示になる（自作問題と同じ扱い）', async () => {
    const decoded = await decodeProblemParam(await encodeProblemParam(full));
    expect(decoded.isUserProblem).toBe(true);
    expect(decoded.id).toBe('shared');
    // 画像は運ばない（自作問題に画像は付かない）
    expect(decoded.questionImageUrl).toBeNull();
  });

  it('URLセーフな文字だけになる', async () => {
    expect(await encodeProblemParam(full)).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('赤5（0m/0p/0s）が保たれる', async () => {
    const p = { ...full, tiles: ['0m', '0p', '0s'], dora: '0p' };
    const decoded = await decodeProblemParam(await encodeProblemParam(p));
    expect(decoded.tiles).toEqual(['0m', '0p', '0s']);
    expect(decoded.dora).toBe('0p');
  });

  it('空の問題でも往復できる', async () => {
    const decoded = await decodeProblemParam(await encodeProblemParam({}));
    expect(decoded.tiles).toEqual([]);
    expect(decoded.melds).toEqual([]);
    expect(decoded.otherDiscards).toBeNull();
    expect(decoded.scores).toBeNull();
    expect(decoded.riichi).toBeNull();
    expect(decoded.problemType).toBe('default');
  });

  it('問題タイプごとの固有フィールドが保たれる', async () => {
    const naki = { ...full, problemType: 'naki-timing', answer: 'early' };
    expect((await decodeProblemParam(await encodeProblemParam(naki))).answer).toBe('early');

    const betaori = { ...full, problemType: 'betaori', answer: '1z,6z,1m' };
    const d = await decodeProblemParam(await encodeProblemParam(betaori));
    expect(d.problemType).toBe('betaori');
    expect(d.answer).toBe('1z,6z,1m');   // 順序付きリストなので順番も保つ

    const riichi = { ...full, problemType: 'riichi-judgment', riichi: true };
    expect((await decodeProblemParam(await encodeProblemParam(riichi))).riichi).toBe(true);
  });

  // 牌譜から切り出した実データ（一番データ量が多くなる形）でも壊れないこと
  it('牌譜由来の問題を往復できる', async () => {
    const board = snapshotToProblem(replayRound(paifu, 2, { seat: 1, turn: 12 }).snapshot);
    const decoded = await decodeProblemParam(await encodeProblemParam(board));
    expect(decoded.tiles).toEqual(board.tiles);
    expect(decoded.melds).toEqual(board.melds);
    expect(decoded.otherDiscards).toEqual(board.otherDiscards);
    expect(decoded.scores).toEqual(board.scores);
    expect(decoded.jikaze).toBe(board.jikaze);
    expect(decoded.junme).toBe(board.junme);
  });

  it('URL全長が実用範囲に収まる（最大ケースで600字以内）', async () => {
    const board = snapshotToProblem(replayRound(paifu, 2, { seat: 1, turn: 14 }).snapshot);
    const heavy = {
      ...board,
      explanation: 'この形はまだ二向聴で、字牌を先に払う必要がある。ドラの受けを残したい。',
      note: '相手のリーチ後',
      title: '牌譜より',
    };
    const param = await encodeProblemParam(heavy);
    // 中継URL（https://…/api/share-q?p=）ぶんの余裕を見て 600 字を上限とする
    expect(param.length + 40).toBeLessThan(600);
  });
});

// URL は誰でも書き換えられる。壊れた入力で画面が壊れないことを固定する
describe('decodeProblemParam の検証', () => {
  const invalid = {
    '空文字':            '',
    'null':              null,
    '数値':              123,
    'base64ではない':     '???',
    '長すぎる':           'a'.repeat(4001),
    'base64だが中身が壊れている': 'YWJjZGVm',
  };

  for (const [label, value] of Object.entries(invalid)) {
    it(`${label} は null を返す`, async () => {
      expect(await decodeProblemParam(value)).toBeNull();
    });
  }

  it('未知の牌コードを含むと null', async () => {
    // 't' に牌コードとして解釈できない文字を混ぜる
    const broken = await makeParam({ t: 'ab*' });
    expect(await decodeProblemParam(broken)).toBeNull();
  });

  it('未知の問題タイプは null', async () => {
    expect(await decodeProblemParam(await makeParam({ y: 'unknown-type' }))).toBeNull();
  });

  it('範囲外の局・巡目は null', async () => {
    expect(await decodeProblemParam(await makeParam({ k: 9 }))).toBeNull();
    expect(await decodeProblemParam(await makeParam({ u: 99 }))).toBeNull();
    expect(await decodeProblemParam(await makeParam({ b: '北' }))).toBeNull();  // 北場は無い
  });

  it('壊れた副露は null', async () => {
    expect(await decodeProblemParam(await makeParam({ m: ['xLLL1'] }))).toBeNull();  // 未知の種類
    expect(await decodeProblemParam(await makeParam({ m: ['pLL1'] }))).toBeNull();   // ポンなのに2枚
  });

  it('壊れた河は null', async () => {
    expect(await decodeProblemParam(await makeParam({ o: ['西|b|0|'] }))).not.toBeNull();
    expect(await decodeProblemParam(await makeParam({ o: ['中|b|0|'] }))).toBeNull();  // 家が風でない
  });

  it('手牌が15枚以上は null', async () => {
    expect(await decodeProblemParam(await makeParam({ t: 'b'.repeat(15) }))).toBeNull();
  });

  // 描画が破綻するほど大きなデータを他人に送りつけられないようにする。
  // deflate は同じ文字の繰り返しを極端に縮めるので、短いURLからでも巨大なJSONが作れる
  it('展開後が巨大な入力（zip bomb）は null', async () => {
    const bomb = await makeParam({ e: 'あ'.repeat(500000) });
    // URL自体は短いままであること（＝長さチェックだけでは防げないことの確認）
    expect(bomb.length).toBeLessThan(4000);
    expect(await decodeProblemParam(bomb)).toBeNull();
  });

  it('副露が5組以上は null', async () => {
    // 'p' = ポン、'E' = 1z（TILE_CODES の 30 番目）、'1' = 上家から
    const meld = 'pEEE1';
    expect(await decodeProblemParam(await makeParam({ m: Array(4).fill(meld) }))).not.toBeNull();
    expect(await decodeProblemParam(await makeParam({ m: Array(5).fill(meld) }))).toBeNull();
  });

  it('河が5家ぶん以上、または1家31枚以上は null', async () => {
    const line = w => `${w}|bcd|0|`;
    expect(await decodeProblemParam(await makeParam({ o: ['東', '南', '西', '北'].map(line) }))).not.toBeNull();
    expect(await decodeProblemParam(await makeParam({ o: ['東', '南', '西', '北', '東'].map(line) }))).toBeNull();
    expect(await decodeProblemParam(await makeParam({ o: [`東|${'b'.repeat(31)}||`] }))).toBeNull();
  });

  it('鳴き選択の候補が多すぎると null', async () => {
    expect(await decodeProblemParam(await makeParam({ z: Array(21).fill('b1') }))).toBeNull();
  });

  it('解説・注釈・タイトルは長さで切り詰める（弾かずに表示できる形にする）', async () => {
    const p = await decodeProblemParam(await makeParam({ e: 'あ'.repeat(3000), i: 'い'.repeat(3000) }));
    expect(p.explanation).toHaveLength(1000);
    expect(p.title).toHaveLength(1000);
  });
});

// テスト用に、圧縮前の中身を直接作ってパラメータ化する
async function makeParam(overrides) {
  const base = {
    t: '', a: '', d: '', r: null, y: 'default', c: '', z: [], m: [],
    b: null, k: null, h: null, j: null, u: null, o: [], s: null, e: '', n: '', i: '',
  };
  const json = JSON.stringify({ ...base, ...overrides });
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(json));
  writer.close();
  const bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('1文字マップの網羅', () => {
  it('副露の種類がすべて1文字に対応している（種類を増やしたらここが落ちる）', () => {
    for (const type of MELD_TYPES) {
      expect(SHARE_INTERNALS.MELD_TYPE_TO_CHAR[type], type).toBeTruthy();
    }
  });

  it('牌コードは37種類（赤5込みの数牌30 + 字牌7）', () => {
    expect(SHARE_INTERNALS.TILE_CODES).toHaveLength(37);
    // 順序を変えると過去に配ったURLが別の牌に化けるので、先頭と末尾を固定する
    expect(SHARE_INTERNALS.TILE_CODES[0]).toBe('0m');
    expect(SHARE_INTERNALS.TILE_CODES[36]).toBe('7z');
  });
});
