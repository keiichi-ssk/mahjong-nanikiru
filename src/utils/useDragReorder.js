import { useRef, useState } from 'react';

// 横並びリストのドラッグ＆ドロップ並べ替え共通フック（ベタオリの回答順で使用）。
// 管理画面の捨て牌ドラッグと同じ操作感（掴んだ牌は薄く表示・挿入位置に縦線
// インジケーター・離した時点で確定）を、HTML5 DnD ではなく Pointer Events で
// 実装している（HTML5 DnD はタッチ端末で動かないため。マウス・タッチ両対応）。
//
// 使い方（戻り値は必ず分割代入で受けること。オブジェクトのまま drag.handlers 等に
// アクセスすると、ref を含む戻り値全体が ref 扱いされて react-hooks/refs の lint エラーになる）:
//   const { containerRef, dragIndex, dropIndex, handlers } = useDragReorder(moveItem);
//   <div ref={containerRef}>                      // コンテナ直下の子 = 並べ替え対象のみにする
//     {items.map((item, i) => (
//       <div key={item} data-drag-index={i} {...handlers}
//            className={
//              (dragIndex === i ? '…--dragging' : '') +
//              (dropIndex === i ? ' …--drop-before' : '') +
//              (dropIndex === i + 1 && i === items.length - 1 ? ' …--drop-after' : '')
//            } />
//     ))}
//   </div>
//   moveItem(from, to) は「from の要素を取り除いて to に挿入」（splice 2回）を実装する
//
// 注意:
// - 各アイテムに data-drag-index={i} を必ず付ける（ハンドラはここから位置を読む）
// - ドラッグ対象には CSS で touch-action: none を指定する（指ドラッグ中のスクロールを抑止）
// - key は index 依存にしない（並べ替えでDOMが再生成されるとポインタキャプチャが切れる）
export function useDragReorder(onMove, { disabled = false } = {}) {
  const containerRef = useRef(null);
  const [dragIndex, setDragIndex] = useState(null);
  // 挿入位置（0〜length）。移動しても並びが変わらない位置（自分の前後）は null
  const [dropIndex, setDropIndex] = useState(null);

  // ポインタ位置から挿入位置を求める。牌の左半分なら前、右半分なら後ろに挿入
  function insertPosFromPointer(clientX) {
    const container = containerRef.current;
    if (!container) return null;
    const children = [...container.children];
    if (children.length === 0) return null;
    for (let i = 0; i < children.length; i++) {
      const r = children[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return children.length;
  }

  const handlers = {
    onPointerDown: e => {
      if (disabled) return;
      // キャプチャすることで要素外に指/カーソルが出ても move/up を受け取れる
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragIndex(Number(e.currentTarget.dataset.dragIndex));
    },
    onPointerMove: e => {
      if (dragIndex === null || disabled) return;
      const pos = insertPosFromPointer(e.clientX);
      setDropIndex(pos === null || pos === dragIndex || pos === dragIndex + 1 ? null : pos);
    },
    onPointerUp: () => {
      if (dragIndex !== null && dropIndex !== null) {
        // 挿入位置は「取り除く前」の座標なので、取り除いた後の to に換算する
        onMove(dragIndex, dropIndex > dragIndex ? dropIndex - 1 : dropIndex);
      }
      setDragIndex(null);
      setDropIndex(null);
    },
    onPointerCancel: () => {
      setDragIndex(null);
      setDropIndex(null);
    },
  };

  return { containerRef, dragIndex, dropIndex, handlers };
}
