// 盤面（BoardView）の寸法と長さの計算。
//
// ★ 牌の寸法は CSS ではなくここが持つ。回転ブロックのサイズ計算に必要なため
//   （CSS と二重に持つと必ずズレる）。BoardView.jsx から切り出してあるのは、
//   ResponsiveBoard が「卓に必要な幅」を知る必要があるのに、
//   コンポーネントのファイルからは関数を export できない（react-refresh）ため。
//
// ⚠️ 牌の寸法を変えたら、board.css の .board-center（240px 固定）や
//   ResponsiveBoard の基準サイズの実測値も測り直すこと。
import { getMeldTileRole } from './problemConstants';

export const RIVER_COLUMNS = 6; // 1行あたりの捨て牌の枚数（実卓と同じ6枚）

// 盤面の牌の寸法（px）。盤面は編集の主役なのでパレットより大きく取る
export const TILE      = { w: 26, h: 35, gap: 2, meldGap: 6 };
export const HAND_TILE = { w: 38, h: 50, gap: 3, meldGap: 8 };
// 中央（局設定）に置く王牌の牌サイズ。5枚＋gap で .board-center-info の 124px に収める
export const WALL_TILE = { w: 23, h: 30, gap: 2, meldGap: 6 };

// 手牌が空のときに出す「手牌が未設定です」の幅。手牌と同じ扱いで辺の中央に置くため、
// 長さ0ではなくこの値を渡す（0 だと左端が辺の中央に来て右へずれる）。
// admin.css の .board-empty-text の width と必ず揃えること
export const EMPTY_HAND_LEN = 150;

// 手牌の並びの長さ（その家から見た横幅）
export function handLength(count, size) {
  return count > 0 ? count * size.w + (count - 1) * size.gap : 0;
}

export function riverSize(count) {
  if (count === 0) return { w: 0, h: 0 };
  const cols = Math.min(RIVER_COLUMNS, count);
  const rows = Math.ceil(count / RIVER_COLUMNS);
  return {
    w: cols * TILE.w + (cols - 1) * TILE.gap,
    h: rows * TILE.h + (rows - 1) * TILE.gap,
  };
}

export function meldWidth(meld, size = TILE) {
  const tilesWidth = meld.tiles.reduce(
    (sum, _, i) => sum + (getMeldTileRole(meld.type, i, meld.from) === 'rotated' ? size.h : size.w),
    0
  );
  return tilesWidth + (meld.tiles.length - 1);
}

export function meldsWidth(melds, size = TILE) {
  if (!melds?.length) return 0;
  return melds.reduce((sum, m) => sum + meldWidth(m, size), 0) + (melds.length - 1) * size.meldGap;
}

// 自分の手牌行（下辺）が収まるのに必要な盤面の幅。
//
// 手牌の左端は CSS が min(50% − 手牌長/2, 100% − 副露長 − 8px − 手牌長) で決める（board.css）。
// 「100%」＝ .board-hand-row の幅は「盤面の幅 − SELF_HAND_ROW_INSET」で、これが足りないと
// 第2項が負になり **手牌が卓の左へはみ出す**（絶対配置なので横スクロールでも拾えない）。
// 幅に余裕のある PC では起きないが、ResponsiveBoard で基準幅を決めるときは必ずこれを満たすこと。
//
// ★ INSET は実測値（左右の他家の手牌 TILE.h×2 ＝70 ＋ .board の padding 20 ＋ 内側グリッドの余白 12）。
//   牌の寸法や盤面のグリッドを変えたら測り直すこと
const SELF_HAND_ROW_INSET = 102;

export function selfHandRowWidth(tiles = [], melds = []) {
  const handLen = tiles.length > 0 ? handLength(tiles.length, HAND_TILE) : EMPTY_HAND_LEN;
  return SELF_HAND_ROW_INSET + handLen + 8 + meldsWidth(melds, HAND_TILE);
}
