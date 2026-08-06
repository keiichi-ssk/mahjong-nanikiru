import { describe, it, expect } from 'vitest';
import { fitSize, MAX_IMAGE_EDGE } from './imageResize';

// 縮小そのもの（canvas）はブラウザ APIなのでテストできない。
// 寸法の計算だけを純粋関数に切り出してここで固定する
describe('fitSize', () => {
  it('長辺を maxEdge に収める（横長）', () => {
    expect(fitSize(3200, 1800, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it('長辺を maxEdge に収める（縦長）', () => {
    expect(fitSize(650, 1300, 1600)).toEqual({ width: 650, height: 1300 }); // 既に収まっている
    expect(fitSize(1000, 2000, 1600)).toEqual({ width: 800, height: 1600 });
  });

  it('小さい画像は拡大しない', () => {
    expect(fitSize(640, 480, 1600)).toEqual({ width: 640, height: 480 });
  });

  it('ちょうど maxEdge はそのまま', () => {
    expect(fitSize(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it('比率を保つ（丸めは四捨五入）', () => {
    const { width, height } = fitSize(1920, 1080, 1600);
    expect(width).toBe(1600);
    expect(height).toBe(900);
  });

  it('寸法が取れないときは 0 を返す（呼び出し側が元ファイルにフォールバックする）', () => {
    expect(fitSize(0, 0, 1600)).toEqual({ width: 0, height: 0 });
    expect(fitSize(NaN, NaN, 1600)).toEqual({ width: 0, height: 0 });
  });

  it('既定の maxEdge は 1600', () => {
    expect(fitSize(3200, 1600)).toEqual({ width: MAX_IMAGE_EDGE, height: 800 });
  });
});
