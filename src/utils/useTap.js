import { useRef } from 'react';

// タッチ端末向けタップハンドラ。
// 素早い連続タップが近い位置で起こると、ブラウザのダブルタップ判定が
// 2回目のクリックイベントを1回目と同じ要素に誤配送することがある
// （touch-action: manipulation では防げない）。
// touchend で直接処理して合成クリックを抑止し、指の真下の要素で確定させる。
// マウス操作は onClick でそのまま動く。
//
// 使い方: <button {...useTap(handler, { disabled })} />
export function useTap(onTap, { disabled = false } = {}) {
  const touchStart = useRef(null);

  return {
    onClick: disabled ? undefined : onTap,
    onTouchStart(e) {
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd(e) {
      const start = touchStart.current;
      touchStart.current = null;
      if (disabled || !start || !e.cancelable) return;
      // ネストした別のインタラクティブ要素（カード内のボタン等）からの
      // バブリングは無視する（そちら側のクリックを潰さない）
      const interactive = e.target.closest('button, [role="button"], a, input, select, textarea');
      if (interactive && interactive !== e.currentTarget) return;
      const t = e.changedTouches[0];
      // 指が大きく動いた場合はスクロール操作なので無視
      if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) return;
      e.preventDefault(); // 合成クリック（誤配送の原因）を発生させない
      onTap();
    },
  };
}
