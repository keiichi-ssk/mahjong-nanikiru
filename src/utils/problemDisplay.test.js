import { describe, it, expect } from 'vitest';
import { usesBoardView, usesSuitRemap, showsSituation } from './problemDisplay';

describe('usesBoardView', () => {
  it('自作問題は盤面で出す', () => {
    expect(usesBoardView({ isUserProblem: true })).toBe(true);
  });

  it('公式問題は board_view を立てた問題だけ盤面で出す', () => {
    expect(usesBoardView({ id: 1 })).toBe(false);
    expect(usesBoardView({ id: 1, boardView: true })).toBe(true);
    expect(usesBoardView({ id: 1, boardView: false })).toBe(false);
  });

  // 列を追加する前のデータ（boardView が undefined）でも従来表示のままであること
  it('boardView が無い旧データは従来表示', () => {
    expect(usesBoardView({ id: 1, boardView: undefined })).toBe(false);
    expect(usesBoardView({ id: 1, boardView: null })).toBe(false);
  });

  // 画像が局面を示しているので、盤面を並べると同じ情報が二重に出る
  it('問題画像がある問題は盤面を出さない（自作・公式とも）', () => {
    expect(usesBoardView({ isUserProblem: true, questionImageUrl: 'u-abc.png' })).toBe(false);
    expect(usesBoardView({ id: 1, boardView: true, questionImageUrl: '12.png' })).toBe(false);
    // 画像が無ければ従来どおり
    expect(usesBoardView({ isUserProblem: true, questionImageUrl: null })).toBe(true);
  });

  it('problem が無くても落ちない', () => {
    expect(usesBoardView(null)).toBe(false);
    expect(usesBoardView(undefined)).toBe(false);
  });
});

// 画像に卓がそのまま写っているので、状況（局・巡目・ドラ・点数）を並べても二重になる
describe('showsSituation', () => {
  it('問題画像がある問題では状況・ドラ・点数を出さない', () => {
    expect(showsSituation({ id: 1, questionImageUrl: '12.png' })).toBe(false);
    expect(showsSituation({ isUserProblem: true, questionImageUrl: 'u-abc.webp' })).toBe(false);
  });

  it('画像が無ければ従来どおり出す', () => {
    expect(showsSituation({ id: 1 })).toBe(true);
    expect(showsSituation({ id: 1, questionImageUrl: null })).toBe(true);
    expect(showsSituation({ isUserProblem: true })).toBe(true);
  });

  it('problem が無くても落ちない', () => {
    expect(showsSituation(null)).toBe(false);
    expect(showsSituation(undefined)).toBe(false);
  });
});

describe('usesSuitRemap', () => {
  // 実戦の局面を切り取って議論するためのものなので、元の牌姿からずらさない。
  // 出題画面だけでなく X への共有・共有ページも同じ牌姿になる
  it('自作問題は置換しない', () => {
    expect(usesSuitRemap({ isUserProblem: true })).toBe(false);
    expect(usesSuitRemap({ isUserProblem: true, boardView: true })).toBe(false);
  });

  it('公式問題は置換する（暗記防止）', () => {
    expect(usesSuitRemap({ id: 1 })).toBe(true);
    expect(usesSuitRemap({ id: 1, problemType: 'default' })).toBe(true);
    // 盤面で出す公式問題も従来どおり置換する
    expect(usesSuitRemap({ id: 1, boardView: true })).toBe(true);
  });

  it('問題画像付きは置換しない（画像の中の牌と食い違うため）', () => {
    expect(usesSuitRemap({ id: 1, questionImageUrl: '12.png' })).toBe(false);
  });

  it('旧 image-quiz は置換しない', () => {
    expect(usesSuitRemap({ id: 1, problemType: 'image-quiz' })).toBe(false);
  });

  it('problem が無くても落ちない', () => {
    expect(usesSuitRemap(null)).toBe(false);
    expect(usesSuitRemap(undefined)).toBe(false);
  });
});
