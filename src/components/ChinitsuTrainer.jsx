import { useState, useEffect } from 'react';
import TileButton from './TileButton';
import { getTileImageUrl, getTileLabel, compareTiles, sortTiles } from '../utils/tileUtils';
import { generateChinitsuHand, analyzeDiscard, computeBestDiscards, judgeChinitsu, isWinningHand } from '../utils/chinitsuUtils';
import {
  loadMissedProblems, addMissedProblem, removeMissedProblem,
  saveChinitsuRound, loadChinitsuRound,
} from '../utils/chinitsuStorage';

// スーツ選択は各スーツの5の牌を代表としてボタン表示する
const SUITS = [
  { code: 'm', tile: '5m' },
  { code: 'p', tile: '5p' },
  { code: 's', tile: '5s' },
];

function loadSuit() {
  const stored = localStorage.getItem('chinitsuSuit');
  return SUITS.some(s => s.code === stored) ? stored : 'p';
}

function newRound(suit) {
  return { hand: generateChinitsuHand(suit), discardedIndex: null, selectedWaits: new Set() };
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
// onBack 省略時は認証不要の単独公開ページ（chinitsu.html）用として「戻る」ボタンを出さない
export default function ChinitsuTrainer({ onBack }) {
  // 出題スーツ(m/p/s)。localStorageに保存して次回以降も維持する
  const [suit, setSuit] = useState(loadSuit);
  // リロードしても同じ手牌が続くよう、保存済みの1問があればそれを復元する
  const [round, setRound] = useState(() => loadChinitsuRound() ?? newRound(loadSuit()));

  useEffect(() => {
    saveChinitsuRound(round);
  }, [round]);
  const [result, setResult] = useState(null);
  const [tally, setTally] = useState({ correct: 0, total: 0 });
  // reviewQueue: null = 通常のランダム出題。配列なら復習モード（現在の1問の後に控えている手牌の残り）
  const [reviewQueue, setReviewQueue] = useState(null);
  const [missedCount, setMissedCount] = useState(() => loadMissedProblems().length);

  const { hand, discardedIndex, selectedWaits } = round;
  const answered = result !== null;
  const discarded = discardedIndex != null ? hand[discardedIndex] : null;
  // 待ち牌の候補は現在の手牌のスーツに追従する（復習モードでは保存時のスーツになる）
  const waitCandidates = Array.from({ length: 9 }, (_, i) => `${i + 1}${hand[0][1]}`);

  // スーツ切り替え。手牌は再生成せず、同じ数字構成のままスーツだけ置き換える。
  // 数字ベースのソート順は変わらないため discardedIndex はそのまま有効。
  // 回答後（解答パネル表示中）でも、パネル内の牌がズレないよう結果側の牌も置き換える
  function changeSuit(next) {
    if (next === suit) return;
    setSuit(next);
    localStorage.setItem('chinitsuSuit', next);
    const remap = (t) => `${t[0]}${next}`;
    setRound(r => ({
      ...r,
      hand: r.hand.map(remap),
      selectedWaits: new Set([...r.selectedWaits].map(remap)),
    }));
    setResult(res => {
      if (!res) return res;
      const remapped = { ...res };
      if (remapped.bestTiles) remapped.bestTiles = remapped.bestTiles.map(remap);
      if (remapped.bestWaits) remapped.bestWaits = remapped.bestWaits.map(remap);
      if (remapped.waits) remapped.waits = new Set([...remapped.waits].map(remap));
      if (remapped.actualAnalysis) {
        remapped.actualAnalysis = { ...remapped.actualAnalysis, waits: remapped.actualAnalysis.waits.map(remap) };
      }
      return remapped;
    });
  }

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
      setRound(newRound(suit));
    }
    setResult(null);
  }

  return (
    <div className="problem-view">
      <div className="problem-header">
        {onBack ? (
          <button className="btn-back" onClick={onBack}>← 戻る</button>
        ) : (
          <span />
        )}
        <div className="problem-header-right">
          <span className="problem-counter">正解 {tally.correct} / {tally.total}問</span>
        </div>
      </div>

      <div className="chinitsu-rules-header">
        <span className="chinitsu-rules-title">ルール</span>
        {reviewQueue === null && (
          <div className="chinitsu-suit-tabs" role="group" aria-label="出題するスーツ">
            {SUITS.map(({ code, tile }) => (
              <TileButton
                key={code}
                tile={tile}
                onClick={() => changeSuit(code)}
                state={suit === code ? 'selected' : null}
              />
            ))}
          </div>
        )}
      </div>
      <ul className="chinitsu-instruction-list">
        <li>既にアガリの場合 → 「ツモ」</li>
        <li>どの牌を切ってもテンパイしない場合 → 「ノーテン」</li>
        <li>テンパイが取れる場合 → 切る牌と待ち牌をすべて選んで「回答する」</li>
        <li>正解は受け入れ枚数（待ち牌の残り枚数）が最大になる打牌。同じ枚数なら高打点が見込める方が正解</li>
      </ul>

      {reviewQueue === null && missedCount > 0 && (
        <button className="chinitsu-review-btn" onClick={startReview}>
          間違えた問題を復習（{missedCount}問）
        </button>
      )}
      {reviewQueue !== null && (
        <p className="chinitsu-review-status">復習中（残り{reviewQueue.length + 1}問）</p>
      )}

      {!answered && (
        <p className="naki-choice-instruction">切る牌を選んでください</p>
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
            {waitCandidates.map(tile => (
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
