import { describe, it, expect } from 'vitest';
import { keepAnswerToken, pruneAnswers } from './answerEdit';

// 手牌を差し替えたときに正解が取り残される事故（出題画面で選べない正解ができる）の再発防止。
// 詳細は answerEdit.js の冒頭コメントを参照
describe('keepAnswerToken', () => {
  const hand = ['1m', '2m', '3m', '5p', '5p'];

  it('手牌にある牌は残す', () => {
    expect(keepAnswerToken('1m', hand)).toBe(true);
    expect(keepAnswerToken('5p', hand)).toBe(true);
  });

  it('手牌に無い牌は落とす', () => {
    expect(keepAnswerToken('9s', hand)).toBe(false);
    expect(keepAnswerToken('4m', hand)).toBe(false);
  });

  it('赤5は通常の5と別の牌として扱う', () => {
    expect(keepAnswerToken('0p', hand)).toBe(false);
    expect(keepAnswerToken('0p', ['0p', '5p'])).toBe(true);
  });

  it('暗槓は同じ牌が4枚あるときだけ残す', () => {
    expect(keepAnswerToken('ankan:5s', ['5s', '5s', '5s', '5s'])).toBe(true);
    expect(keepAnswerToken('ankan:5s', ['5s', '5s', '5s'])).toBe(false);
    // 赤5混じりの4枚は暗槓の正解にできない（管理画面のカンボタンも出ない）
    expect(keepAnswerToken('ankan:5s', ['5s', '5s', '5s', '0s'])).toBe(false);
  });

  it('牌コードでないトークンは手牌に関係なく残す', () => {
    // 鳴きタイミングの選択肢。手牌を入れ替えても消えてはいけない
    for (const t of ['early', 'mid', 'late', 'no']) {
      expect(keepAnswerToken(t, hand)).toBe(true);
      expect(keepAnswerToken(t, [])).toBe(true);
    }
  });

  it('手牌の指定が無ければ牌の正解は残さない', () => {
    expect(keepAnswerToken('1m')).toBe(false);
    expect(keepAnswerToken('early')).toBe(true);
  });
});

describe('pruneAnswers', () => {
  it('手牌に無い正解だけを落とす（複数正解の一部）', () => {
    expect(pruneAnswers('3m,6m', ['3m', '4m', '5m'])).toBe('3m');
  });

  it('すべて手牌にあれば元のまま', () => {
    expect(pruneAnswers('3m,6m', ['3m', '6m'])).toBe('3m,6m');
  });

  it('すべて落ちたら空文字（未設定）', () => {
    expect(pruneAnswers('3m,6m', ['1p'])).toBe('');
  });

  // ベタオリの answer は「安全な順」の順序付きリスト。並びを崩してはいけない
  it('ベタオリの順序を保つ', () => {
    expect(pruneAnswers('1z,6z,1m,9p', ['1m', '1z', '6z'])).toBe('1z,6z,1m');
  });

  it('暗槓トークンも手牌に追従する', () => {
    const hand = ['5m', '5m', '5m', '5m', '1p'];
    expect(pruneAnswers('ankan:5m,1p', hand)).toBe('ankan:5m,1p');
    // 5m が1枚減れば暗槓は成立しない
    expect(pruneAnswers('ankan:5m,1p', ['5m', '5m', '5m', '1p'])).toBe('1p');
  });

  it('鳴きタイミングの正解は手牌を入れ替えても消えない', () => {
    expect(pruneAnswers('early', ['1m'])).toBe('early');
  });

  it('空・null・未設定は空文字', () => {
    expect(pruneAnswers('', ['1m'])).toBe('');
    expect(pruneAnswers(null, ['1m'])).toBe('');
    expect(pruneAnswers(undefined, ['1m'])).toBe('');
  });

  it('手牌が空なら牌の正解は全部落ちる', () => {
    expect(pruneAnswers('3m,6m', [])).toBe('');
    expect(pruneAnswers('3m,6m')).toBe('');
  });
});
