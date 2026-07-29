// 管理画面の盤面ビュー（BoardView）が使う組み立てロジック。
// DOM/React に依存しない純粋関数として分離してある（判定をコンポーネントに書き戻さないこと）。
//
// 河の枚数のルール（2026-07-27 決定）:
//   - 捨て牌データがある家 … データの枚数だけ表示する（裏向きでの補完はしない）
//   - データが無い家（自分を含む） … 「巡目 ＋ その家の副露数」枚を裏向きで並べる
//   - 巡目が未設定 … 裏向きは並べない
//   - 鳴かれた牌は河から減らさず、網掛けにして「鳴かれた」と分かるようにする

// api/ 配下（Vercel Functions）からも読み込まれるため拡張子を明示する
// （api/og-problem.js が seatWinds を使う。他の src/utils は慣例で省略のまま）
import { windAt } from './problemConstants.js';

// 自分から見た他家の席順（盤面の左・上・右に対応）
export const SEATS = ['上家', '対面', '下家'];

// 各席の風を返す。自風が未設定なら風は決められないので null が並ぶ
export function seatWinds(jikaze) {
  return SEATS.map(rel => ({ relative: rel, wind: windAt(jikaze, rel) }));
}

// 鳴かれた牌を「出した家の風」ごとに集める。
// 自分の副露も他家の副露も対象で、鳴いた牌は副露の1枚目（getMeldTileRole が横向きにする牌）。
// 暗槓は from が null なので対象外になる。
// jikaze が未設定だと自分の副露は出所を特定できないため無視される（他家どうしの分は集まる）
export function collectCalledTiles({ jikaze = null, melds = [], otherDiscards = [] } = {}) {
  const out = {};
  const add = (wind, tile) => {
    if (!wind || !tile) return;
    (out[wind] ??= []).push(tile);
  };
  for (const meld of melds ?? []) {
    add(windAt(jikaze, meld?.from), meld?.tiles?.[0]);
  }
  for (const od of otherDiscards ?? []) {
    for (const meld of od?.melds ?? []) {
      add(windAt(od?.player, meld?.from), meld?.tiles?.[0]);
    }
  }
  return out;
}

/**
 * 1家ぶんの河を組み立てる。
 * 返り値は { tile, hidden, called } の配列（tile は hidden のとき null）。
 *
 * @param tiles        その家の捨て牌データ（無ければ空配列）
 * @param junme        巡目（未設定なら null）
 * @param meldCount    その家の副露の数。鳴くと打牌が1回増えるので河が伸びる
 * @param calledTiles  この家の河から鳴かれた牌のコード配列
 * @param revealCalled データが無い河で、鳴かれた牌を表向きにするか。
 *                     自分の河だけ true（何を鳴かれたかは重要な情報なので見せる）。
 *                     他家は false ＝ 裏向きのまま網掛けだけ付ける（副露を見れば牌は分かるため）
 */
export function buildRiver({
  tiles = [], junme = null, meldCount = 0, calledTiles = [], revealCalled = true,
  tsumogiri = null,
} = {}) {
  if (tiles.length > 0) {
    // 同じ牌が複数あるときは前（先に捨てた方）を鳴かれたものとして扱う
    const marked = new Set();
    for (const called of calledTiles) {
      const i = tiles.findIndex((tile, idx) => tile === called && !marked.has(idx));
      if (i >= 0) marked.add(i);
    }
    // ツモ切りは牌と1対1で対応する。データが無い（＝分からない）家は全部 false になる
    return tiles.map((tile, i) => ({
      tile,
      hidden: false,
      called: marked.has(i),
      tsumogiri: Array.isArray(tsumogiri) ? tsumogiri[i] === true : false,
    }));
  }

  // データが無い家は裏向きで埋める。鳴かれた牌は河の末尾に置く
  // （河のどの位置で切ったかはデータに無いため末尾固定）
  const total = junme != null
    ? Math.max(junme + meldCount, calledTiles.length)
    : calledTiles.length;
  const hiddenCount = Math.max(0, total - calledTiles.length);
  return [
    ...Array.from({ length: hiddenCount }, () => ({ tile: null, hidden: true, called: false, tsumogiri: false })),
    ...calledTiles.map(tile => ({
      tile: revealCalled ? tile : null, hidden: !revealCalled, called: true, tsumogiri: false,
    })),
  ];
}
