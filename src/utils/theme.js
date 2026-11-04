import { useCallback, useEffect, useState } from 'react';

// ライト／ダークの切り替え（2026-11-04〜）。
// 表示中のテーマは <html data-theme="light|dark"> で表し、index.css の :root[data-theme="dark"] が色を差し替える。
// ユーザーが明示的に選んだときだけ localStorage に保存し、選んでいなければ端末の設定（prefers-color-scheme）に従う。
// ★ 各HTML（index.html / chinitsu.html / share.html）の <head> に、同じ判定を行う数行のスクリプトがある
//   （画面が描かれる前に data-theme を付け、ライト→ダークのちらつきを防ぐため）。
//   保存キーや判定を変えたら、そちらも必ずそろえること。
// ★ admin.html と myproblems.html には付けない（旧配色を admin.css の :root で固定しているため。
//   data-theme="dark" が付くと :root[data-theme="dark"] の方が強くて旧配色を上書きしてしまう）

export const THEME_STORAGE_KEY = 'theme';

/** 保存された設定（'light' | 'dark'）と端末の設定から、表示するテーマを決める（純粋関数） */
export function resolveTheme(preference, systemPrefersDark) {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemPrefersDark ? 'dark' : 'light';
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

const darkQuery = () => (typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null);

/**
 * いまのテーマと切り替え関数を返す。切り替えると、その選択を保存して以後は端末の設定より優先する。
 * 選んでいない間は、端末の設定が変わったら追従する。
 */
export function useTheme() {
  const [preference, setPreference] = useState(loadPreference);
  const [systemDark, setSystemDark] = useState(() => darkQuery()?.matches ?? false);

  useEffect(() => {
    const q = darkQuery();
    if (!q) return undefined;
    const onChange = e => setSystemDark(e.matches);
    q.addEventListener('change', onChange);
    return () => q.removeEventListener('change', onChange);
  }, []);

  const theme = resolveTheme(preference, systemDark);

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
