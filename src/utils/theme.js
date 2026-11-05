import { useCallback, useEffect, useState } from 'react';

// ライト／ダークの切り替え（2026-11-04〜）。
// 表示中のテーマは <html data-theme="light|dark"> で表し、index.css の :root[data-theme="dark"] が色を差し替える。
// **既定はダーク**（2026-11-05〜）。端末の設定（prefers-color-scheme）には従わず、まだ切り替えたことがない人は
// 全員ダークで表示する。ヘッダーの切り替えで選んだときだけ localStorage に保存し、以後はそれに従う。
// ★ 各HTML（index.html / chinitsu.html / share.html）の <head> に、同じ判定を行う数行のスクリプトがある
//   （画面が描かれる前に data-theme を付け、ちらつきを防ぐため）。
//   保存キーや判定（既定のテーマ）を変えたら、そちらも必ずそろえること（theme.test.js が検査する）。
// ★ admin.html と myproblems.html には付けない（旧配色を admin.css の :root で固定しているため。
//   data-theme="dark" が付くと :root[data-theme="dark"] の方が強くて旧配色を上書きしてしまう）

export const THEME_STORAGE_KEY = 'theme';

/** 保存した設定が無いときのテーマ */
export const DEFAULT_THEME = 'dark';

/** 保存された設定（'light' | 'dark' | それ以外）から、表示するテーマを決める（純粋関数） */
export function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference;
  return DEFAULT_THEME;
}

function loadPreference() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function savePreference(preference) {
  try { localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* 保存できなくても表示は切り替える */ }
}

/**
 * いまのテーマと切り替え関数を返す。切り替えると、その選択を保存して次からもそのテーマで開く。
 */
export function useTheme() {
  const [preference, setPreference] = useState(loadPreference);
  const theme = resolveTheme(preference);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    savePreference(next);
    setPreference(next);
  }, [theme]);

  return { theme, toggle };
}
