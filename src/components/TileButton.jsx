import { getTileImageUrl, getTileLabel } from '../utils/tileUtils';
import { useTap } from '../utils/useTap';

// badge: 牌の右上に重ねる短いテキスト（ベタオリの選択順 ①②③… 等）。null なら非表示
export default function TileButton({ tile, onClick, state, badge = null }) {
  const imageUrl = getTileImageUrl(tile);
  const label = getTileLabel(tile);
  const disabled = state !== null && state !== 'selected';
  // ダブルタップ結合による隣の牌への誤配送を防ぐ（詳細は useTap.js 参照）
  const tap = useTap(onClick, { disabled });

  const classNames = ['tile-button', state ? `tile-button--${state}` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classNames}
      {...tap}
      disabled={disabled}
      title={label}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="tile-image" />
      ) : (
        <span className="tile-fallback">{label}</span>
      )}
      {badge != null && <span className="tile-order-badge">{badge}</span>}
    </button>
  );
}
