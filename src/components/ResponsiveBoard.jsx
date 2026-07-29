// 出題画面で麻雀卓（BoardView）を表示するためのラッパー。
//
// BoardView は管理画面の編集用に作られていて、牌の寸法（TILE / HAND_TILE）を JSX の定数として持ち、
// 回転ブロックのサイズ計算もそれに依存している。画面幅ごとに牌を小さくしようとすると
// その計算と CSS 側の固定値（.board-center の 300px など）を全部連動させることになり壊れやすい。
//
// そこで **卓は常に基準サイズで組み、コンテナ幅に合わせて丸ごと transform: scale() する**。
// 牌の寸法計算には一切触らずにスマホ幅へ収められる（縮尺が変わるだけなので比率も崩れない）。
//
// 表示専用（readOnly）に固定してある。盤面から編集する用途は管理画面が直接 BoardView を使うこと。
import { useEffect, useRef, useState } from 'react';
import BoardView from '../admin/BoardView';

// 卓を組む基準サイズ（px）。実際に必要な幅は
//   左右の他家の手牌（TILE.h = 35 × 2）＋ 左右の河（3行なら 109 × 2）＋ 中央（300）＋ padding（20）
// で 600 前後になるため、少し余裕を持たせてある。
// 高さは自分の手牌（HAND_TILE.h = 50）を出すかどうかで変わる。
//
// ★ 実測値（河が3行まで伸びた終盤の局面＝一番きつい条件）は 598 × 538（手牌なし）/ 601（手牌あり）。
//   .board は縦に overflow を持たないので、足りないと卓の外へ牌がはみ出す。
//   牌の寸法（BoardView の TILE / HAND_TILE）を変えたらこの値も measure し直すこと
const BASE_WIDTH = 620;
const BASE_HEIGHT = 640;
const BASE_HEIGHT_WITHOUT_HAND = 560;

export default function ResponsiveBoard({ hideSelfHand = false, ...boardProps }) {
  const outerRef = useRef(null);
  // 初期値は 1（等倍）。コンテナ幅が基準より狭いときだけ縮む
  const [scale, setScale] = useState(1);
  const baseHeight = hideSelfHand ? BASE_HEIGHT_WITHOUT_HAND : BASE_HEIGHT;

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(Math.min(1, width / BASE_WIDTH));
    };
    update();
    // 画面回転・サイドバーの開閉など、window の resize では拾えない変化にも追従させる
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // 縮小しても元の高さぶんの場所を占め続けてしまうため、外側の高さは縮小後の実寸にする
    <div
      className="responsive-board"
      ref={outerRef}
      // 幅の上限も JSX 側で持つ（CSS に基準サイズを二重に書かないため）
      style={{ height: baseHeight * scale, maxWidth: BASE_WIDTH }}
    >
      <div
        className="responsive-board-inner"
        style={{ width: BASE_WIDTH, height: baseHeight, transform: `scale(${scale})` }}
      >
        <BoardView {...boardProps} hideSelfHand={hideSelfHand} readOnly />
      </div>
    </div>
  );
}
