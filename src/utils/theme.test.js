import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTheme, THEME_STORAGE_KEY } from './theme';

describe('resolveTheme（表示するテーマの決定）', () => {
  it('明示的に選んだテーマは端末の設定より優先する', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('選んでいなければ端末の設定に従う', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('知らない値は「選んでいない」として扱う', () => {
    expect(resolveTheme('blue', true)).toBe('dark');
    expect(resolveTheme('blue', false)).toBe('light');
  });
});

// 各HTMLの <head> の先読みスクリプトが theme.js と同じ保存キーを使っているか
// （ずれると、切り替えた設定がページを開いた瞬間に反映されず、ちらつく）
describe('HTML の先読みスクリプト', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  it.each(['index.html', 'chinitsu.html', 'share.html'])('%s が同じ保存キーで data-theme を付ける', (file) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(html).toContain('documentElement.dataset.theme');
  });

  it.each(['admin.html', 'myproblems.html'])('%s には付けない（旧配色を固定しているため）', (file) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    expect(html).not.toContain('documentElement.dataset.theme');
  });
});
