import { getTileImageUrl, getTileLabel } from '../utils/tileUtils';

export default function TileButton({ tile, onClick, state }) {
  const imageUrl = getTileImageUrl(tile);
  const label = getTileLabel(tile);

  const classNames = ['tile-button', state ? `tile-button--${state}` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classNames}
      onClick={onClick}
      disabled={state !== null}
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
