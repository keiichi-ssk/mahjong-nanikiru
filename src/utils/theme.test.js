import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTheme, THEME_STORAGE_KEY, DEFAULT_THEME } from './theme';

describe('resolveTheme（表示するテーマの決定）', () => {
  it('既定はダーク（2026-11-05〜。端末の設定には従わない）', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(resolveTheme(null)).toBe('dark');
  });

  it('切り替えて保存したテーマはそのまま使う', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('知らない値は「保存していない」として既定にする', () => {
    expect(resolveTheme('blue')).toBe('dark');
  });
});

// 各HTMLの <head> の先読みスクリプトが theme.js と同じ保存キー・同じ既定を使っているか
// （ずれると、ページを開いた瞬間と React が描いた後でテーマが変わり、ちらつく）
describe('HTML の先読みスクリプト', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  it.each(['index.html', 'chinitsu.html', 'share.html'])('%s が同じ保存キー・同じ既定で data-theme を付ける', (file) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(html).toContain(`var t = '${DEFAULT_THEME}';`);
    expect(html).toContain('documentElement.dataset.theme');
    // 端末の設定に従う判定は使わない（既定はダーク）
    expect(html).not.toContain('prefers-color-scheme');
  });

  it.each(['admin.html', 'myproblems.html'])('%s には付けない（旧配色を固定しているため）', (file) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    expect(html).not.toContain('documentElement.dataset.theme');
  });
});
