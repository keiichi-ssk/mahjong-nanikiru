import { describe, it, expect } from 'vitest';
import {
  normalizeProblemType,
  isRiichiJudgmentProblem,
  judgeAnswer,
  judgeNakiTiming,
  judgeNakiChoice,
} from './judgeUtils';

describe('normalizeProblemType', () => {
  it('image-quiz は default 扱い', () => {
    expect(normalizeProblemType('image-quiz')).toBe('default');
  });

  it('未設定（null/undefined/空文字）は default 扱い', () => {
    expect(normalizeProblemType(null)).toBe('default');
    expect(normalizeProblemType(undefined)).toBe('default');
    expect(normalizeProblemType('')).toBe('default');
  });

  it('それ以外はそのまま返す', () => {
    expect(normalizeProblemType('riichi-judgment')).toBe('riichi-judgment');
    expect(normalizeProblemType('naki-timing')).toBe('naki-timing');
    expect(normalizeProblemType('naki-choice')).toBe('naki-choice');
  });
});

describe('isRiichiJudgmentProblem', () => {
  it('problemType が riichi-judgment なら true', () => {
    expect(isRiichiJudgmentProblem({ problemType: 'riichi-judgment' })).toBe(true);
  });

  it('レガシー section「1_リーチ判断」の default 問題も true', () => {
    expect(isRiichiJudgmentProblem({ problemType: 'default', section: '1_リーチ判断' })).toBe(true);
    expect(isRiichiJudgmentProblem({ problemType: null, section: '1_リーチ判断' })).toBe(true);
  });

  it('現行形式の section（数値文字列）なら false', () => {
    expect(isRiichiJudgmentProblem({ problemType: 'default', section: '1' })).toBe(false);
  });

  it('naki系タイプはレガシー section でも false', () => {
    expect(isRiichiJudgmentProblem({ problemType: 'naki-timing', section: '1_リーチ判断' })).toBe(false);
  });
});

describe('judgeAnswer: default（何切る）', () => {
  const base = { problemType: 'default', section: '1', answer: '8s', riichi: null };

  it('正解牌を選べば正解', () => {
    expect(judgeAnswer(base, { selected: '8s' })).toBe(true);
  });

  it('不正解牌を選べば不正解', () => {
    expect(judgeAnswer(base, { selected: '1m' })).toBe(false);
  });

  it('riichi: null ならリーチ選択は判定に影響しない', () => {
    expect(judgeAnswer(base, { selected: '8s', selectedRiichi: true })).toBe(true);
    expect(judgeAnswer(base, { selected: '8s', selectedRiichi: null })).toBe(true);
  });

  it('riichi: true の問題は正解牌＋リーチ押下で正解', () => {
    const p = { ...base, riichi: true };
    expect(judgeAnswer(p, { selected: '8s', selectedRiichi: true })).toBe(true);
    expect(judgeAnswer(p, { selected: '8s', selectedRiichi: null })).toBe(false);
    expect(judgeAnswer(p, { selected: '8s', selectedRiichi: false })).toBe(false);
    expect(judgeAnswer(p, { selected: '1m', selectedRiichi: true })).toBe(false);
  });

  // 2026-06-19 のバグの回帰テスト: リーチボタン未押し（null）は false と同等に扱う
  it('riichi: false の問題はリーチ未押し（null）でも正解になる', () => {
    const p = { ...base, riichi: false };
    expect(judgeAnswer(p, { selected: '8s', selectedRiichi: null })).toBe(true);
    expect(judgeAnswer(p, { selected: '8s', selectedRiichi: false })).toBe(true);
    expect(judgeAnswer(p, { selected: '8s', selectedRiichi: true })).toBe(false);
  });

  it('暗槓が正解の問題は ankan: 形式の一致で判定する', () => {
    const p = { ...base, answer: 'ankan:5m' };
    expect(judgeAnswer(p, { selected: 'ankan:5m' })).toBe(true);
    expect(judgeAnswer(p, { selected: '5m' })).toBe(false);
  });

  it('image-quiz も default と同じ判定', () => {
    const p = { ...base, problemType: 'image-quiz' };
    expect(judgeAnswer(p, { selected: '8s' })).toBe(true);
    expect(judgeAnswer(p, { selected: '1m' })).toBe(false);
  });
});

describe('judgeAnswer: riichi-judgment（リーチ判断）', () => {
  const base = { problemType: 'riichi-judgment', section: '1', answer: '', riichi: true };

  it('リーチ選択が riichi と一致すれば正解', () => {
    expect(judgeAnswer(base, { selected: '__riichi_choice__', selectedRiichi: true })).toBe(true);
    expect(judgeAnswer(base, { selected: '__riichi_choice__', selectedRiichi: false })).toBe(false);
  });

  it('riichi: false（ダマが正解）の問題', () => {
    const p = { ...base, riichi: false };
    expect(judgeAnswer(p, { selected: '__riichi_choice__', selectedRiichi: false })).toBe(true);
    expect(judgeAnswer(p, { selected: '__riichi_choice__', selectedRiichi: true })).toBe(false);
  });

  it('レガシー section「1_リーチ判断」でも同じ判定', () => {
    const p = { problemType: 'default', section: '1_リーチ判断', answer: '8s', riichi: true };
    expect(judgeAnswer(p, { selected: '__riichi_choice__', selectedRiichi: true })).toBe(true);
  });
});

describe('judgeNakiTiming', () => {
  const p = { problemType: 'naki-timing', answer: 'mid' };

  it('選択が answer と一致すれば正解', () => {
    expect(judgeNakiTiming(p, 'mid')).toBe(true);
    expect(judgeNakiTiming(p, 'early')).toBe(false);
    expect(judgeNakiTiming(p, 'no')).toBe(false);
  });
});

describe('judgeNakiChoice', () => {
  const choices = [
    { tile: '3m', correct: true },
    { tile: '6m', correct: true },
    { tile: '2p', correct: false },
    { tile: '7s', correct: false },
  ];

  it('correct の牌を過不足なく選べば正解', () => {
    expect(judgeNakiChoice(choices, new Set(['3m', '6m']))).toBe(true);
  });

  it('選び漏れは不正解', () => {
    expect(judgeNakiChoice(choices, new Set(['3m']))).toBe(false);
  });

  it('余分に選ぶと不正解', () => {
    expect(judgeNakiChoice(choices, new Set(['3m', '6m', '2p']))).toBe(false);
  });

  it('正解が「なし（鳴かない）」の場合は無選択が正解', () => {
    const noneCorrect = choices.map(c => ({ ...c, correct: false }));
    expect(judgeNakiChoice(noneCorrect, new Set())).toBe(true);
    expect(judgeNakiChoice(noneCorrect, new Set(['3m']))).toBe(false);
  });

  it('Set の代わりに配列も受け付ける', () => {
    expect(judgeNakiChoice(choices, ['3m', '6m'])).toBe(true);
    expect(judgeNakiChoice(choices, ['3m'])).toBe(false);
  });

  it('nakiChoices が null/undefined でも落ちない', () => {
    expect(judgeNakiChoice(null, new Set())).toBe(true);
    expect(judgeNakiChoice(undefined, new Set(['3m']))).toBe(false);
  });
});
