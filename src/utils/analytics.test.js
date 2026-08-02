// 計測は「壊れても画面に何も出ない」種類の処理なので、テストで挙動を固定しておく。
// 特に *gtag が無い環境で例外を投げないこと* は必ず守ること（計測のために画面を壊さない）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { track, shareSource, EVENTS } from './analytics';

afterEach(() => {
  delete globalThis.window;
});

describe('track', () => {
  it('gtag が無ければ何もせず false を返す（例外を投げない）', () => {
    globalThis.window = {};
    expect(() => track(EVENTS.drillStart)).not.toThrow();
    expect(track(EVENTS.drillStart)).toBe(false);
  });

  it('window が無くても落ちない（SSR・テスト環境）', () => {
    expect(() => track(EVENTS.drillStart)).not.toThrow();
    expect(track(EVENTS.drillStart)).toBe(false);
  });

  it('gtag があれば event として送る', () => {
    const gtag = vi.fn();
    globalThis.window = { gtag };
    expect(track(EVENTS.drillAnswer, { mode: 'timeattack', correct: true })).toBe(true);
    expect(gtag).toHaveBeenCalledWith('event', 'drill_answer', { mode: 'timeattack', correct: true });
  });

  it('パラメータを省略すると空オブジェクトで送る', () => {
    const gtag = vi.fn();
    globalThis.window = { gtag };
    track(EVENTS.problemSaved);
    expect(gtag).toHaveBeenCalledWith('event', 'problem_saved', {});
  });
});

describe('shareSource', () => {
  // GA4 のレポートで使う値なので、増やすときはここも更新する（勝手に文言を変えると過去の数字と繋がらない）
  it.each([
    ['/myproblems.html', 'myproblems'],
    ['/chinitsu.html', 'chinitsu'],
    ['/admin.html', 'admin'],
    ['/', 'app'],
    ['/index.html', 'app'],
  ])('%s → %s', (pathname, expected) => {
    expect(shareSource(pathname)).toBe(expected);
  });

  it('window が無ければ app 扱い（落ちない）', () => {
    expect(shareSource()).toBe('app');
  });
});

describe('EVENTS', () => {
  // GA4 側に貯まる名前そのもの。**変えると過去のデータと繋がらなくなる**ので、
  // 名前を変えたい場合は新しいイベントを足す形にすること
  it('イベント名は固定', () => {
    expect(EVENTS).toEqual({
      drillStart: 'drill_start',
      drillAnswer: 'drill_answer',
      drillFinish: 'drill_finish',
      problemSaved: 'problem_saved',
      problemShared: 'problem_shared',
      sharedProblemOpened: 'shared_problem_opened',
    });
  });
});
