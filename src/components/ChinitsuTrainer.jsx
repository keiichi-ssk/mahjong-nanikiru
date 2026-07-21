import { useState } from 'react';
import TileButton from './TileButton';
import { getTileImageUrl, getTileLabel, compareTiles, sortTiles } from '../utils/tileUtils';
import { generateChinitsuHand, analyzeDiscard, computeBestDiscards, judgeChinitsu, isWinningHand } from '../utils/chinitsuUtils';
import { loadMissedProblems, addMissedProblem, removeMissedProblem } from '../utils/chinitsuStorage';

const WAIT_CANDIDATES = ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'];

function newRound() {
  return { hand: generateChinitsuHand(), discardedIndex: null, selectedWaits: new Set() };
}

function TileList({ tiles }) {
  return tiles.map(t => (
    <div key={t} className="tile-readonly">
      <img src={getTileImageUrl(t)} alt={getTileLabel(t)} />
    </div>
  ));
}

// 清一色トレーニング。毎回ランダム生成した筒子14枚に対し、ツモ／ノーテン／
// （切る牌+待ち牌の指定による）テンパイ、のいずれかを最初から自由に選んで回答する。
// 正誤は chinitsuUtils.js が算出する受け入れ枚数・待ちと照合してその場で判定する
// （DB・Supabaseには一切保存しない、セッション内のみの独立モード）
export default function ChinitsuTrainer({ onBack }) {
  const [round, setRound] = useState(newRound);
  const [result, setResult] = useState(null);
  const [tally, setTally] = useState({ correct: 0, total: 0 });
  // reviewQueue: null = 通常のランダム出題。配列なら復習モード（現在の1問の後に控えている手牌の残り）
  const [reviewQueue, setReviewQueue] = useState(null);
  const [missedCount, setMissedCount] = useState(() => loadMissedProblems().length);

  const { hand, discardedIndex, selectedWaits } = round;
  const answered = result !== null;
  const discarded = discardedIndex != null ? hand[discardedIndex] : null;

  // 正解ならレビュー中の問題を復習リストから外し、不正解なら復習リストに記録する
  // （リスト保存はlocalStorageのみ・DBには保存しない）
  function recordOutcome(isCorrect) {
    if (isCorrect) {
      if (reviewQueue !== null) removeMissedProblem(hand);
    } else {
      addMissedProblem(hand);
    }
    setMissedCount(loadMissedProblems().length);
  }

  function startReview() {
    const missed = loadMissedProblems();
    if (missed.length === 0) return;
    const [first, ...rest] = missed;
    setReviewQueue(rest);
    setRound({ hand: first, discardedIndex: null, selectedWaits: new Set() });
    setResult(null);
  }

  function selectDiscard(index) {
    if (answered) return;
    setRound(r => ({ ...r, discardedIndex: index }));
  }

  function toggleWait(tile) {
    if (answered) return;
    setRound(r => {
      const next = new Set(r.selectedWaits);
      next.has(tile) ? next.delete(tile) : next.add(tile);
      return { ...r, selectedWaits: next };
    });
  }

  function declareAgari() {
    if (answered) return;
    const isCorrect = isWinningHand(hand);
    setResult({ mode: 'agari', isCorrect });
    setTally(t => ({ correct: t.correct + (isCorrect ? 1 : 0), total: t.total + 1 }));
    recordOutcome(isCorrect);
  }

  // 既にアガリの手で「ノーテン」または「テンパイ+待ち」を回答してしまった＝アガリを見逃している
  function recordMissedAgari() {
    setResult({ mode: 'missed-agari', isCorrect: false });
    setTally(t => ({ ...t, total: t.total + 1 }));
    recordOutcome(false);
  }

  function declareNoten() {
    if (answered) return;
    if (isWinningHand(hand)) return recordMissedAgari();
    const { maxUkeire, bestTiles } = computeBestDiscards(hand);
    const isCorrect = maxUkeire === 0;
    setResult({ mode: 'noten', isCorrect, maxUkeire, bestTiles });
    setTally(t => ({ correct: t.correct + (isCorrect ? 1 : 0), total: t.total + 1 }));
    recordOutcome(isCorrect);
  }

  function submitTenpai() {
    if (answered || !discarded || selectedWaits.size === 0) return;
    if (isWinningHand(hand)) return recordMissedAgari();
    const { maxUkeire, bestTiles, analysisByTile } = computeBestDiscards(hand);
    const actualAnalysis = analyzeDiscard(hand, discarded);
    const isCorrect = judgeChinitsu(hand, discarded, 'tenpai', selectedWaits);
    const bestWaits = sortTiles([...new Set(bestTiles.flatMap(t => analysisByTile.get(t).waits))]);
    setResult({ mode: 'discard', isCorrect, maxUkeire, bestTiles, bestWaits, actualAnalysis, waits: selectedWaits });
    setTally(t => ({ correct: t.correct + (isCorrect ? 1 : 0), total: t.total + 1 }));
    recordOutcome(isCorrect);
  }

  function nextHand() {
    if (reviewQueue !== null && reviewQueue.length > 0) {
      const [nextH, ...rest] = reviewQueue;
      setReviewQueue(rest);
      setRound({ hand: nextH, discardedIndex: null, selectedWaits: new Set() });
    } else {
      setReviewQueue(null);
      setRound(newRound());
    }
    setResult(null);
  }

  return (
    <div className="problem-view">
      <div className="problem-header">
        <button className="btn-back" onClick={onBack}>← カテゴリへ</button>
        <div className="problem-header-right">
          <span className="problem-counter">正解 {tally.correct} / {tally.total}問</span>
        </div>
      </div>

      <p className="naki-choice-instruction">
        既にアガリの形なら「ツモ」を、どの牌を切ってもテンパイにならないなら「ノーテン」を選んでください。
        テンパイになる場合は、切る牌と待ち牌をすべて選んでから「回答する」を押してください。
      </p>

      {reviewQueue === null && missedCount > 0 && (
        <button className="chinitsu-review-btn" onClick={startReview}>
          間違えた問題を復習（{missedCount}問）
        </button>
      )}
      {reviewQueue !== null && (
        <p className="chinitsu-review-status">復習中（残り{reviewQueue.length + 1}問）</p>
      )}

      <div className="tile-selector-row">
        <div className="tile-selector" style={{ '--hand-count': 14 }}>
          {hand.map((tile, i) => (
            <TileButton
              key={`${tile}-${i}`}
              tile={tile}
              onClick={() => selectDiscard(i)}
              state={i === discardedIndex ? 'selected' : (answered ? 'disabled' : null)}
            />
          ))}
        </div>
      </div>

      {!answered && (
        <div className="riichi-choice-btns">
          <button className="riichi-choice-btn chinitsu-tsumo-btn" onClick={declareAgari}>
            ツモ
          </button>
          <button className="riichi-choice-btn tenpai-choice-btn--noten" onClick={declareNoten}>
            ノーテン
          </button>
        </div>
      )}

      {!answered && (
        <>
          <p className="naki-choice-instruction">待ち牌をすべて選んでください（複数選択可）</p>
          <div className="tile-selector" style={{ '--hand-count': 9 }}>
            {WAIT_CANDIDATES.map(tile => (
              <TileButton
                key={tile}
                tile={tile}
                onClick={() => toggleWait(tile)}
                state={selectedWaits.has(tile) ? 'selected' : null}
              />
            ))}
          </div>
          <button
            className="naki-choice-submit-btn"
            disabled={!discarded || selectedWaits.size === 0}
            onClick={submitTenpai}
          >
            回答する
          </button>
        </>
      )}

      {answered && result.mode === 'agari' && (
        <div className={`answer-panel ${result.isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
          <div className="answer-result">{result.isCorrect ? '正解！' : '不正解'}</div>
          <div className="answer-tile">
            <span className="answer-tile-name">
              {result.isCorrect
                ? 'この手牌は完成形でした。ツモの宣言で正解です。'
                : 'この手牌はまだ完成していません（ツモではありません）。'}
            </span>
          </div>
        </div>
      )}

      {answered && result.mode === 'missed-agari' && (
        <div className="answer-panel answer-panel--wrong">
          <div className="answer-result">不正解</div>
          <div className="answer-tile">
            <span className="answer-tile-name">
              この手牌は既に完成形（ツモ）でした。ツモを見逃しています。
            </span>
          </div>
        </div>
      )}

      {answered && result.mode === 'noten' && (
        <div className={`answer-panel ${result.isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
          <div className="answer-result">{result.isCorrect ? '正解！' : '不正解'}</div>
          {result.isCorrect ? (
            <div className="answer-tile">
              <span className="answer-tile-name">この手牌はどの牌を切ってもテンパイになりません。</span>
            </div>
          ) : (
            <div className="answer-tile">
              <span className="answer-label">実は最善の打牌：</span>
              <TileList tiles={result.bestTiles} />
              <span className="answer-tile-name">（受け入れ{result.maxUkeire}枚でテンパイ）</span>
            </div>
          )}
        </div>
      )}

      {answered && result.mode === 'discard' && (
        <div className={`answer-panel ${result.isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
          <div className="answer-result">{result.isCorrect ? '正解！' : '不正解'}</div>

          <div className="answer-tile">
            <span className="answer-label">切った牌：</span>
            <TileList tiles={[discarded]} />
            <span className="answer-tile-name">（受け入れ{result.actualAnalysis.ukeire}枚）</span>
          </div>

          <div className="answer-tile">
            <span className="answer-label">回答した待ち：</span>
            <TileList tiles={[...result.waits].sort(compareTiles)} />
          </div>

          <div className="answer-tile">
            <span className="answer-label">最善の打牌：</span>
            <TileList tiles={result.bestTiles} />
            <span className="answer-tile-name">（受け入れ{result.maxUkeire}枚）</span>
          </div>

          <div className="answer-tile">
            <span className="answer-label">最善の打牌時の待ち：</span>
            <TileList tiles={result.bestWaits} />
          </div>
        </div>
      )}

      <div className="problem-nav">
        <button className="btn-nav btn-nav--finish" onClick={nextHand}>
          次の問題 →
        </button>
      </div>
    </div>
  );
}
