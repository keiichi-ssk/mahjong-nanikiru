import { describe, it, expect } from 'vitest';
import { toUserDb, fromUserDb, makeNewUserProblem, OMITTED_COLUMNS } from './userProblemMapper';
import { toDb } from './problemMapper';

const sample = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'テスト問題',
  categoryId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  tiles: ['1m', '2m', '3m'],
  answer: '1m,2m',
  dora: '4z',
  riichi: true,
  explanation: '解説[3m]です',
  disabled: false,
  melds: [{ type: 'pon', tiles: ['1p', '1p', '1p'], from: '対面' }],
  problemType: 'betaori',
  discardedTile: '5s',
  nakiChoices: [{ tile: '1p', correct: true }],
  questionImageUrl: null,
  bakaze: '東',
  kyoku: 1,
  honba: 2,
  jikaze: '南',
  junme: 9,
  note: '注釈[1m]',
  // tsumogiri は牌譜から作った問題だけが持つ（null は「分からない」）
  otherDiscards: [{ player: '上家', tiles: ['1z'], riichiIndex: null, melds: [], tsumogiri: [true] }],
  scores: { 東: 25000, 南: 25000, 西: 25000, 北: 25000, kyotaku: 1000 },
};

describe('toUserDb', () => {
  it('user_problems に無い列（id/section/image/reviewed）を含まない', () => {
    const row = toUserDb(sample, { categoryId: 'c1' });
    for (const col of OMITTED_COLUMNS) {
      expect(row).not.toHaveProperty(col);
    }
  });

  // ★ 保存のたびに送ると、null で上書きして共有リンクと集計を壊す。
  //   これらの更新は共有ボタンと api/answer だけが行う（userProblemMapper.js のコメント参照）
  it('共有トークンと集計の列を含まない（保存で上書きしない）', () => {
    const row = toUserDb({ ...sample, shareToken: 'tok', answerTally: { '1m': 3 } }, { categoryId: 'c1' });
    expect(row).not.toHaveProperty('share_token');
    expect(row).not.toHaveProperty('answer_tally');
    expect(row).not.toHaveProperty('answer_version');
  });

  it('category_id・title を持つ', () => {
    const row = toUserDb(sample, { categoryId: 'c1' });
    expect(row.category_id).toBe('c1');
    expect(row.title).toBe('テスト問題');
  });

  // 更新のたびに送る必要がない値なので、insert する側だけが付ける
  it('user_id を含まない', () => {
    expect(toUserDb(sample, { categoryId: 'c1' })).not.toHaveProperty('user_id');
  });

  // 採番はDBのトリガーに任せ、更新でも番号を変えない
  it('display_no を含まない', () => {
    expect(toUserDb({ ...sample, displayNo: 3 }, { categoryId: 'c1' })).not.toHaveProperty('display_no');
  });

  it('categoryId 未指定なら category_id は null（未分類）', () => {
    const row = toUserDb(sample, {});
    expect(row.category_id).toBeNull();
  });

  it('snake_case へ変換される', () => {
    const row = toUserDb(sample, {});
    expect(row.problem_type).toBe('betaori');
    expect(row.discarded_tile).toBe('5s');
    expect(row.other_discard).toEqual(sample.otherDiscards);
  });

  // ゴールデンテスト。problems に列を足して toDb に反映したとき、
  // user_problems 側への追加を忘れるとここが落ちる（意図的に除く列は OMITTED_COLUMNS に入れる）
  it('toDb が返す列を取りこぼさない', () => {
    const dbCols = Object.keys(toDb(sample));
    const userCols = Object.keys(toUserDb(sample, {}));
    const missing = dbCols.filter(c => !OMITTED_COLUMNS.includes(c) && !userCols.includes(c));
    expect(missing).toEqual([]);
  });
});

describe('fromUserDb', () => {
  it('title と categoryId を取り出す', () => {
    const row = { ...toUserDb(sample, { categoryId: 'c1' }), id: 'p1' };
    const p = fromUserDb(row);
    expect(p.title).toBe('テスト問題');
    expect(p.categoryId).toBe('c1');
  });

  it('problemMapper の camelCase 化が効く', () => {
    const row = { ...toUserDb(sample, {}), id: 'p1' };
    const p = fromUserDb(row);
    expect(p.problemType).toBe('betaori');
    expect(p.discardedTile).toBe('5s');
    expect(p.otherDiscards).toEqual(sample.otherDiscards);
  });

  it('title が無い行でも空文字になる', () => {
    const p = fromUserDb({ id: 'p1', tiles: [], melds: [] });
    expect(p.title).toBe('');
    expect(p.categoryId).toBeNull();
    expect(p.displayNo).toBeNull();
  });

  // 画面に出す番号。採番はDBのトリガーが行う
  it('display_no を displayNo として取り出す', () => {
    expect(fromUserDb({ id: 'p1', display_no: 12, tiles: [], melds: [] }).displayNo).toBe(12);
  });

  // 共有リンクのトークン。未共有の問題では null
  it('share_token を shareToken として取り出す', () => {
    const token = '22222222-2222-2222-2222-222222222222';
    expect(fromUserDb({ id: 'p1', share_token: token, tiles: [], melds: [] }).shareToken).toBe(token);
    expect(fromUserDb({ id: 'p1', tiles: [], melds: [] }).shareToken).toBeNull();
  });
});

describe('toUserDb → fromUserDb の往復', () => {
  it('主要な値が保たれる（保存してリロードしても同じになること）', () => {
    const row = { ...toUserDb(sample, { categoryId: 'c1' }), id: 'p1' };
    const p = fromUserDb(row);

    expect(p.tiles).toEqual(sample.tiles);
    expect(p.answer).toBe(sample.answer);
    expect(p.dora).toBe(sample.dora);
    expect(p.riichi).toBe(sample.riichi);
    expect(p.explanation).toBe(sample.explanation);
    expect(p.melds).toEqual(sample.melds);
    expect(p.problemType).toBe(sample.problemType);
    expect(p.nakiChoices).toEqual(sample.nakiChoices);
    expect(p.bakaze).toBe(sample.bakaze);
    expect(p.kyoku).toBe(sample.kyoku);
    expect(p.honba).toBe(sample.honba);
    expect(p.jikaze).toBe(sample.jikaze);
    expect(p.junme).toBe(sample.junme);
    expect(p.note).toBe(sample.note);
    expect(p.scores).toEqual(sample.scores);
    expect(p.otherDiscards).toEqual(sample.otherDiscards);
  });

  it('副露の「鳴いた元」が保たれる', () => {
    const row = { ...toUserDb(sample, {}), id: 'p1' };
    expect(fromUserDb(row).melds[0].from).toBe('対面');
  });
});

describe('makeNewUserProblem', () => {
  it('手牌が空（ProblemEditor が prevProblem からの引き継ぎを判定できる状態）', () => {
    const p = makeNewUserProblem();
    expect(p.tiles).toEqual([]);
    expect(p.answer).toBe('');
  });

  it('そのまま toUserDb に通せる', () => {
    const row = toUserDb(makeNewUserProblem(), { categoryId: 'c1' });
    expect(row.category_id).toBe('c1');
    expect(row.tiles).toEqual([]);
    expect(row.problem_type).toBe('default');
  });
});
