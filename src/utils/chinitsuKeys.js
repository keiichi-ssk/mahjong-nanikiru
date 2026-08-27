import { useEffect, useRef } from 'react';

// メンチン何切るドリルのキーボード操作。
//
// ★ 押されたキーを「何をする操作か」に変換する部分は純粋関数 resolveKeyAction に分離してある。
//   キー割り当てを変えるときはここだけを直すこと（コンポーネント側に条件を書き戻さない）。
// ★ 判定ロジック（chinitsuUtils.js の evaluateAnswer）には一切触れない。
//   このファイルがやるのは「マウス操作と同じコールバックをキーからも呼ぶ」ことだけ。
//
// 割り当て（1〜9 は切る牌と待ち牌で意味が変わる「段階制」）:
//   1〜9   … 切る牌が未選択なら切る牌を選択 / 選択済みなら待ち牌をトグル
//   - / 0 / n … ノーテンで回答（画面に出すのはテンキーに合わせた - と 0 だけ）
//   + / t     … ツモで回答（画面に出すのは + だけ）
//   Enter  … 未回答なら「回答する」/ 解答パネル表示中なら「次の問題へ」
//   Backspace … 待ちが1枚以上あれば最後の1枚を解除、無ければ切る牌の選択を解除

// 解答パネルに移った直後の Enter を無視する時間（ms）。
// 「回答する」を Enter で押した勢いでもう一度押しても、解説を読まずに次へ飛ばないようにする。
const NEXT_COOLDOWN_MS = 250;

// 押されたキーから数字を取り出す。
// ★ code も見るのは NumLock オフのテンキー対策（key が 'End' / 'ArrowDown' などになる）。
//   code は物理キーなので NumLock の状態に関わらず 'Numpad1' のまま届く。
function digitOf(key, code) {
  if (typeof key === 'string' && /^[0-9]$/.test(key)) return Number(key);
  const m = typeof code === 'string' ? /^Numpad([0-9])$/.exec(code) : null;
  return m ? Number(m[1]) : null;
}

/**
 * キー入力を操作に変換する（純粋関数）。該当しなければ null を返す。
 *
 * @param {{key: string, code?: string, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean}} e
 * @param {{answered: boolean, hasDiscard: boolean, waitCount: number, handDigits: number[]}} ctx
 * @returns {{type: string, digit?: number} | null}
 */
export function resolveKeyAction(e, ctx) {
  // 修飾キー付きはブラウザ／OSのショートカットなので拾わない
  if (e.ctrlKey || e.altKey || e.metaKey) return null;

  const { answered, hasDiscard, waitCount, handDigits } = ctx;
  const key = e.key;
  const code = e.code;

  // 解答パネル表示中は「次の問題へ」だけ受け付ける（誤って回答が動かないように）
  if (answered) {
    return key === 'Enter' ? { type: 'next' } : null;
  }

  const digit = digitOf(key, code);
  if (digit === 0) return { type: 'noten' };
  if (digit !== null) {
    // 切る牌の段階では手牌に無い数字を無視する（待ちの段階は9種すべて選べる）
    if (!hasDiscard) {
      return handDigits.includes(digit) ? { type: 'discard', digit } : null;
    }
    return { type: 'wait', digit };
  }

  if (key === '-' || code === 'NumpadSubtract' || key === 'n' || key === 'N') return { type: 'noten' };
  if (key === '+' || code === 'NumpadAdd' || key === 't' || key === 'T') return { type: 'tsumo' };
  if (key === 'Enter') return { type: 'submit' };
  if (key === 'Backspace') return { type: waitCount > 0 ? 'undoWait' : 'undoDiscard' };

  return null;
}

// 入力欄にフォーカスがあるとき（タイムアタックのニックネーム欄など）はキーを奪わない
function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

// Tab でボタンやリンクへ移動してから Enter を押したときは、そのボタン本来の動作を優先する
// （シェアリンク・スーツ切り替え・タイムアタックのボタンがキーボードだけで押せなくなるのを防ぐ）。
// ただし手牌・待ち牌の牌ボタン（.tile-selector の中）は Enter に固有の意味を持たないので、
// マウスで牌を選んだあとの Enter は「回答する」として扱う（これが主要な操作の流れ）。
function isFocusedControl(target) {
  if (!target || typeof target.closest !== 'function') return false;
  const el = target.closest('a[href], button');
  return el !== null && el.closest('.tile-selector') === null;
}

/**
 * キーボード操作を window に配線するフック。
 * 渡すコールバックはマウス操作用のものをそのまま使えばよい（挙動を分岐させない）。
 *
 * @param {object} options
 * @param {boolean} options.enabled 出題中だけ true にする（タイムアタックの開始前・結果画面では false）
 */
export function useChinitsuKeys({
  enabled,
  answered,
  hasDiscard,
  waitCount,
  handDigits,
  onDiscard,
  onWait,
  onTsumo,
  onNoten,
  onSubmit,
  onNext,
  onUndoWait,
  onUndoDiscard,
}) {
  // 毎レンダーの最新値を ref に写し、リスナーは enabled が変わったときだけ張り替える
  const latest = useRef(null);
  useEffect(() => {
    latest.current = {
      answered, hasDiscard, waitCount, handDigits,
      onDiscard, onWait, onTsumo, onNoten, onSubmit, onNext, onUndoWait, onUndoDiscard,
    };
  });

  // 解答パネルに移った時刻。Enter の連打で解説を飛ばさないためのクールダウンに使う
  const answeredAt = useRef(0);
  useEffect(() => {
    if (answered) answeredAt.current = Date.now();
  }, [answered]);

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(e) {
      if (isTypingTarget(e.target)) return;
      const s = latest.current;
      if (!s) return;
      const action = resolveKeyAction(e, {
        answered: s.answered,
        hasDiscard: s.hasDiscard,
        waitCount: s.waitCount,
        handDigits: s.handDigits,
      });
      if (!action) return;
      if (action.type === 'next' && Date.now() - answeredAt.current < NEXT_COOLDOWN_MS) return;
      if ((action.type === 'submit' || action.type === 'next') && isFocusedControl(e.target)) return;

      // フォーカスの当たったボタンが Enter / Space で再度クリックされるのを防ぐ
      e.preventDefault();

      switch (action.type) {
        case 'discard': s.onDiscard(action.digit); break;
        case 'wait': s.onWait(action.digit); break;
        case 'tsumo': s.onTsumo(); break;
        case 'noten': s.onNoten(); break;
        case 'submit': s.onSubmit(); break;
        case 'next': s.onNext(); break;
        case 'undoWait': s.onUndoWait(); break;
        case 'undoDiscard': s.onUndoDiscard(); break;
        default: break;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
