import { useState } from 'react';
import TileButton from './TileButton';

// メンチン何切るドリルの「回答入力UI」（切る牌グリッド＋ツモ／ノーテン＋待ち牌グリッド＋回答ボタン）。
// 通常モード(ChinitsuTrainer)とタイムアタックモード(ChinitsuTimeAttack)の両方から使う共通部品。
// 正誤の判定・結果の生成は呼び出し側が担い、ここは入力の見た目とコールバックだけを持つ（純粋な表示）。
// answered=true のときは切る牌グリッドを選択・無効状態で残し、操作系（ツモ／ノーテン／待ち／回答）は隠す。
export default function ChinitsuAnswerInput({
  hand,
  discardedIndex,
  selectedWaits,
  answered,
  onSelectDiscard,
  onToggleWait,
  onTsumo,
  onNoten,
  onSubmit,
}) {
  // キー一覧の開閉。問題が変わってもこのコンポーネントは再マウントされないので、開いたままが保たれる
  const [keyHelpOpen, setKeyHelpOpen] = useState(false);

  const discarded = discardedIndex != null ? hand[discardedIndex] : null;
  // 待ち牌の候補は現在の手牌のスーツに追従する
  const waitCandidates = Array.from({ length: 9 }, (_, i) => `${i + 1}${hand[0][1]}`);

  // 回答は「切る牌 → 待ち牌」の2段階。いま操作する段階（＝1〜9キーが効く方）を強調する。
  // 段階の切り替わりは切る牌を選んだかどうかだけで決まる（キー割り当ては utils/chinitsuKeys.js）
  const hasDiscard = discarded != null;
  // 操作中の段階（＝1〜9キーが効く方）の見出しを左の色バーと明るい文字で示す
  const stepClass = (active) => `chinitsu-step${active ? ' chinitsu-step--active' : ''}`;

  return (
    <>
      {!answered && (
        <p className={stepClass(!hasDiscard)}>
          {hasDiscard ? (
            <>
              ① 切る牌 <span className="chinitsu-step-check">✓</span>
              <span className="chinitsu-step-note">（Backspace で選び直し）</span>
            </>
          ) : '① 切る牌を選んでください'}
        </p>
      )}
      <div className="tile-selector-row">
        <div className="tile-selector" style={{ '--hand-count': 14 }}>
          {hand.map((tile, i) => (
            <TileButton
              key={`${tile}-${i}`}
              tile={tile}
              onClick={() => onSelectDiscard(i)}
              state={i === discardedIndex ? 'selected' : (answered ? 'disabled' : null)}
            />
          ))}
        </div>
      </div>

      {/* キー操作の一覧。普段は畳んでおき「キーで回答できる」ことだけを見せる。
          キーボードのないスマホでは丸ごと CSS で隠す（App.css の .chinitsu-key-hint） */}
      {!answered && (
        <details
          className="chinitsu-key-hint"
          open={keyHelpOpen}
          onToggle={e => setKeyHelpOpen(e.currentTarget.open)}
        >
          <summary>⌨ キーボードで回答できます</summary>
          <dl>
            <dt><kbd>1</kbd>〜<kbd>9</kbd></dt>
            <dd>切る牌 → 待ち牌</dd>
            <dt><kbd>+</kbd> / <kbd>T</kbd></dt>
            <dd>ツモ</dd>
            <dt><kbd>-</kbd> / <kbd>N</kbd></dt>
            <dd>ノーテン</dd>
            <dt><kbd>Enter</kbd></dt>
            <dd>回答・次へ</dd>
            <dt><kbd>Backspace</kbd></dt>
            <dd>取り消し</dd>
          </dl>
        </details>
      )}

      {!answered && (
        <div className="riichi-choice-btns">
          {/* 添えたキーはキーボードのある環境向けなので、スマホでは CSS で隠す */}
          <button className="riichi-choice-btn chinitsu-tsumo-btn" onClick={onTsumo}>
            ツモ<span className="chinitsu-btn-key">T</span>
          </button>
          <button className="riichi-choice-btn tenpai-choice-btn--noten" onClick={onNoten}>
            ノーテン<span className="chinitsu-btn-key">N</span>
          </button>
        </div>
      )}

      {!answered && (
        <>
          <p className={stepClass(hasDiscard)}>② 待ち牌をすべて選んでください（複数選択可）</p>
          <div className="tile-selector" style={{ '--hand-count': 9 }}>
            {waitCandidates.map(tile => (
              <TileButton
                key={tile}
                tile={tile}
                onClick={() => onToggleWait(tile)}
                state={selectedWaits.has(tile) ? 'selected' : null}
              />
            ))}
          </div>
          <button
            className="naki-choice-submit-btn"
            disabled={!discarded || selectedWaits.size === 0}
            onClick={onSubmit}
          >
            回答する
          </button>
        </>
      )}
    </>
  );
}
