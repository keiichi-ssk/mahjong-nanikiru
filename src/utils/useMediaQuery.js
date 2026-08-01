import { useEffect, useState } from 'react';

// 画面幅による分岐を JS 側から知るためのフック。
//
// このアプリのスマホ対応は原則 CSS のメディアクエリで行う（出題画面がそうしている）。
// JS で幅を見るのは、CSS だけでは表現できない次の2つに限ること:
//   1. 盤面の縮尺（ResponsiveBoard）— 実測幅からしか計算できない
//   2. 要素の置き場所そのものを変える — CSS の order は別のコンテナへは移せない
// 見た目を変えるだけなら CSS で書くこと（JS 分岐が増えると PC 側の挙動を壊しやすい）。
export function useMediaQuery(query) {
  // SSR は無いが、テスト環境で matchMedia が無い場合に落ちないようにしておく
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}

// スマホ幅の判定。ブレークポイントは出題画面（App.css の @media (max-width: 600px)）と揃える。
// ★ 変えるときは admin.css / myproblems.css のモバイル用ブロックも同じ値にすること
const NARROW_QUERY = '(max-width: 600px)';

export function useIsNarrow() {
  return useMediaQuery(NARROW_QUERY);
}
