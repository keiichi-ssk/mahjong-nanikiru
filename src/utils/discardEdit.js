// 捨て牌ブロック（1家ぶんの河）の編集操作。純粋関数・DOM/React 非依存。
//
// ★ ProblemEditor の中にクロージャとして書くと、テストで守れない。
//   河は「牌の配列」だけでなく **リーチ宣言牌の位置（riichiIndex）** と
//   **ツモ切りフラグ（tsumogiri）** を牌と対応づけて持つので、
//   1枚足す・消す・並べ替えるたびに対応を保たないと河の見た目が丸ごと嘘になる。
//   その対応づけが静かに壊れる種類のバグなので、ここに集約してテストで固定してある。
//   **編集操作を ProblemEditor に書き戻さないこと。**
//
// ブロックの形は problem.otherDiscards[] と同じ:
//   { player, tiles, riichiIndex, melds, tsumogiri }
//
// ★ tsumogiri は null ＝「分からない」。牌譜から作った問題だけが配列を持つ。
//   **null のブロックに牌を足しても null のまま**にすること
//   —— 手作りの河に「全部手出し」という誤った情報を付けないため。

import { normalizeMelds } from './problemConstants';
import { normalizeTsumogiri } from './importBoard';

/** 空のブロック（家も牌も未設定） */
export function emptyDiscardBlock() {
  return { player: null, tiles: [], riichiIndex: null, melds: [], tsumogiri: null };
}

/**
 * 読み込んだ problem.otherDiscards[] の1要素を編集用の形にそろえる。
 * ★ ここで拾い漏らしたフィールドは編集画面を通した時点で失われる（保存時にも消える）。
 *   フィールドを足したときは必ずここにも足すこと（discardEdit.test.js が検出する）
 */
export function toDiscardBlock(od) {
  const tiles = od?.tiles ?? [];
  return {
    player:      od?.player ?? null,
    tiles,
    riichiIndex: od?.riichiIndex ?? null,
    melds:       normalizeMelds(od?.melds),   // 旧データには無いので補う（鳴いた元も補完）
    tsumogiri:   normalizeTsumogiri(od?.tsumogiri, tiles.length),
  };
}

/** 末尾に1枚足す。ツモ切りが分かっているブロックなら「手出し」として足す */
export function addDiscardTile(od, tile) {
  return {
    ...od,
    tiles: [...od.tiles, tile],
    tsumogiri: od.tsumogiri ? [...od.tsumogiri, false] : null,
  };
}

/** index の1枚を取り除く。リーチ宣言牌の位置とツモ切りも詰める */
export function removeDiscardTile(od, index) {
  return {
    ...od,
    tiles: od.tiles.filter((_, i) => i !== index),
    tsumogiri: od.tsumogiri ? od.tsumogiri.filter((_, i) => i !== index) : null,
    riichiIndex: od.riichiIndex === null || od.riichiIndex === index
      ? null
      : od.riichiIndex > index ? od.riichiIndex - 1 : od.riichiIndex,
  };
}

/**
 * from の1枚を insertAt へ動かす。
 * insertAt は**移動前の配列基準**の挿入位置（0〜length）で、ドラッグ中のインジケーターの位置に対応する。
 * 動かしても並びが変わらないときは同じブロックをそのまま返す
 */
export function moveDiscardTile(od, from, insertAt) {
  const to = insertAt > from ? insertAt - 1 : insertAt;
  if (from === to) return od;

  const move = arr => {
    const next = [...arr];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  // リーチ宣言牌の位置を並べ替えに追従させる
  let riichi = od.riichiIndex;
  if (riichi !== null) {
    if (riichi === from) {
      riichi = to;
    } else {
      const idx = riichi > from ? riichi - 1 : riichi;
      riichi = idx >= to ? idx + 1 : idx;
    }
  }

  return {
    ...od,
    tiles: move(od.tiles),
    tsumogiri: od.tsumogiri ? move(od.tsumogiri) : null,
    riichiIndex: riichi,
  };
}

/** 河を空にする。ツモ切りも「分からない」に戻す */
export function clearDiscardTiles(od) {
  return { ...od, tiles: [], riichiIndex: null, tsumogiri: null };
}

/** index の牌をリーチ宣言牌にする／解除する */
export function toggleDiscardRiichi(od, index) {
  return { ...od, riichiIndex: od.riichiIndex === index ? null : index };
}
