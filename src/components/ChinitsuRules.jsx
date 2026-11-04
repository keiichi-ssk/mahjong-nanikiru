import { useEffect, useRef } from 'react';
import { computeBestDiscards } from '../utils/chinitsuUtils';
import { CHINITSU_EXAMPLE_HAND, CHINITSU_EXAMPLE_IMAGES } from '../utils/chinitsuExample';

// メンチン何切るのルール説明（操作の例＋遊び方）と、出題中に開くルールのダイアログ。
// タイムアタックの開始前画面・タイムアタック中・練習モードの3か所で同じものを使う（文言を二重に持たない）。

const noop = () => {};

/** 遊び方の箇条書き。timeAttack のときだけ1行目に制限時間の説明を入れる */
export function ChinitsuRuleList({ timeAttack = false }) {
  return (
    <ul className="chinitsu-instruction-list">
      {timeAttack && <li>90秒で何問正解できるかを記録します</li>}
      <li>既にアガリの場合 → 「ツモ」</li>
      <li>どの牌を切ってもテンパイしない場合 → 「ノーテン」</li>
      <li>テンパイが取れる場合 → 切る牌と待ち牌をすべて選んで「回答する」</li>
      <li>正解は受け入れ枚数（待ち牌の残り枚数）が最大になる打牌。同じ枚数なら高打点が見込める方が正解</li>
    </ul>
  );
}

/**
 * 操作の例。実際の練習画面のスクリーンショット（scripts/capture-chinitsu-example.mjs で撮る）。
 * ライト用とダーク用の2枚を置き、表示中のテーマに合う方だけを CSS で見せる（App.css）。
 * 説明文の打牌と待ちは手で書かず、画像と同じ手牌を判定エンジンにかけて求める
 */
function ChinitsuRuleExample() {
  const { bestTiles, analysisByTile } = computeBestDiscards(CHINITSU_EXAMPLE_HAND);
  const discard = bestTiles[0][0];
  const waits = analysisByTile.get(bestTiles[0]).waits.map(t => t[0]);
  const alt = `回答画面の例。手牌から${discard}を選び、待ち牌の${waits.join('と')}を選んだところ`;
  return (
    <figure className="chinitsu-rules-example">
      {Object.entries(CHINITSU_EXAMPLE_IMAGES).map(([theme, src]) => (
        <img
          key={theme}
          className={`chinitsu-rules-example-img chinitsu-rules-example-img--${theme}`}
          src={src}
          // 画像の実寸（撮り直して寸法が変わったら合わせる。読み込み中に画面がずれないための指定）
          width="780"
          height="790"
          alt={alt}
        />
      ))}
      <figcaption className="chinitsu-rules-example-caption">
        操作の例：{discard}を切ると {waits.join('・')} 待ちのテンパイ。
        {discard}を選び、{waits.join('と')}を選んで「回答する」
      </figcaption>
    </figure>
  );
}

/**
 * 操作の例（左）と遊び方（右）を並べたルール説明。スマホでは「遊び方 → children → 操作の例」の縦並び。
 * children には開始前画面のスタート／練習モードのボタンを入れる（スマホでも例より上に来るように）
 */
export function ChinitsuRules({ timeAttack = false, children = null }) {
  return (
    <div className="chinitsu-rules">
      <ChinitsuRuleExample />
      <div className="chinitsu-rules-text">
        <p className="chinitsu-ta-section-label">遊び方</p>
        <ChinitsuRuleList timeAttack={timeAttack} />
        {children}
      </div>
    </div>
  );
}

/**
 * 出題中に開く「ルール」ボタンとダイアログ。開いている間は onOpenChange(true) を呼ぶ
 * （タイムアタックはこれでタイマーを止める）。ダイアログの背景は不透明にして手牌を見えなくする
 * （止めている間に手牌を見て考えられないように。ランキングがあるため）。
 *
 * open を渡すと開閉を親が持つ（タイムアタックはスタート直後に自動で開くため）。渡さなければ自前で開閉する。
 * actionLabel を渡すと、ダイアログ下部の中央にその文言の塗りボタン（押すと閉じる＝タイマー開始・再開）を出す。
 */
export function ChinitsuRulesButton({ timeAttack = false, open: openProp, onOpenChange = noop, actionLabel = null }) {
  const dialogRef = useRef(null);
  const actionRef = useRef(null);
  const show = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // 下部のボタン（スタート／再開する）があればそこにフォーカスを置き、Enter で始められるようにする
    actionRef.current?.focus();
  };
  const close = () => dialogRef.current?.close();

  // 親が開閉を持つ場合は、open の変化に <dialog> を合わせる
  useEffect(() => {
    if (openProp === undefined) return;
    if (openProp) show();
    else close();
  }, [openProp]);

  const open = () => {
    show();
    onOpenChange(true);
  };
  return (
    <>
      <button type="button" className="chinitsu-rules-btn" onClick={open}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
        ルール
      </button>
      <dialog
        ref={dialogRef}
        className="chinitsu-rules-dialog"
        aria-label="ルール"
        // Esc で閉じたときもここを通る
        onClose={() => onOpenChange(false)}
        onClick={(e) => { if (e.target === dialogRef.current) close(); }}
      >
        {/* 「閉じる」は置かない。下部中央のスタート／再開するが閉じる役目を兼ねる（Esc・外側のクリックでも閉じる） */}
        <h2 className="chinitsu-rules-dialog-title">ルール</h2>
        {timeAttack && <p className="chinitsu-rules-dialog-note">この画面を表示している間はタイマーが止まります</p>}
        <ChinitsuRules timeAttack={timeAttack} />
        {actionLabel && (
          <div className="chinitsu-rules-dialog-actions">
            <button ref={actionRef} type="button" className="chinitsu-rules-start-btn" onClick={close}>
              {actionLabel}
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
