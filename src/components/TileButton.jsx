import { useRef } from 'react';
import { getTileImageUrl, getTileLabel } from '../utils/tileUtils';

export default function TileButton({ tile, onClick, state }) {
  const imageUrl = getTileImageUrl(tile);
  const label = getTileLabel(tile);
  const disabled = state !== null && state !== 'selected';
  const touchStart = useRef(null);

  // タッチ操作は touchend で直接処理し、合成クリックを抑止する。
  // 素早い連続タップ（隣の牌を続けてタップ等）はブラウザのダブルタップ判定で
  // 2回目のクリックが1回目と同じ牌に誤配送されることがあるため、
  // クリックイベントに頼らず指の真下の牌で確定させる。
  function handleTouchStart(e) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e) {
    const start = touchStart.current;
    touchStart.current = null;
    if (disabled || !start || !e.cancelable) return;
    const t = e.changedTouches[0];
    // 指が大きく動いた場合はスクロール操作なので無視
    if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) return;
    e.preventDefault(); // 合成クリック（誤配送の原因）を発生させない
    onClick();
  }

  const classNames = ['tile-button', state ? `tile-button--${state}` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classNames}
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      disabled={disabled}
      title={label}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="tile-image" />
      ) : (
        <span className="tile-fallback">{label}</span>
      )}
    </button>
  );
}
