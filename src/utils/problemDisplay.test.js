import { describe, it, expect } from 'vitest';
import { usesBoardView } from './problemDisplay';

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

  it('problem が無くても落ちない', () => {
    expect(usesBoardView(null)).toBe(false);
    expect(usesBoardView(undefined)).toBe(false);
  });
});
