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
  const discarded = discardedIndex != null ? hand[discardedIndex] : null;
  // 待ち牌の候補は現在の手牌のスーツに追従する
  const waitCandidates = Array.from({ length: 9 }, (_, i) => `${i + 1}${hand[0][1]}`);

  return (
    <>
      {!answered && (
        <p className="naki-choice-instruction">切る牌を選んでください</p>
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

      {!answered && (
        <div className="riichi-choice-btns">
          <button className="riichi-choice-btn chinitsu-tsumo-btn" onClick={onTsumo}>
            ツモ
          </button>
          <button className="riichi-choice-btn tenpai-choice-btn--noten" onClick={onNoten}>
            ノーテン
          </button>
        </div>
      )}

      {!answered && (
        <>
          <p className="naki-choice-instruction">待ち牌をすべて選んでください（複数選択可）</p>
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
