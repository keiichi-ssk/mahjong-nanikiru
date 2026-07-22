import { useState, useEffect } from 'react';
import TileButton from './TileButton';
import ChinitsuAnswerInput from './ChinitsuAnswerInput';
import ChinitsuAnswerResult from './ChinitsuAnswerResult';
import { generateChinitsuHand, evaluateAnswer } from '../utils/chinitsuUtils';
import {
  loadMissedProblems, removeMissedProblem,
  saveChinitsuRound, loadChinitsuRound,
} from '../utils/chinitsuStorage';
import { decodeHandParam, buildShareUrl } from '../utils/chinitsuShare';

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

// 初期手牌の優先順位: シェアURLの ?q= パラメータ → sessionStorage の復元 → ランダム生成
function initialRound() {
  const param = new URLSearchParams(window.location.search).get('q');
  const sharedHand = param ? decodeHandParam(param) : null;
  if (sharedHand) return { hand: sharedHand, discardedIndex: null, selectedWaits: new Set() };
  return loadChinitsuRound() ?? newRound(loadSuit());
}


// 清一色トレーニング。毎回ランダム生成した筒子14枚に対し、ツモ／ノーテン／
// （切る牌+待ち牌の指定による）テンパイ、のいずれかを最初から自由に選んで回答する。
// 正誤は chinitsuUtils.js が算出する受け入れ枚数・待ちと照合してその場で判定する
// （DB・Supabaseには一切保存しない、セッション内のみの独立モード）
// onBack 省略時は認証不要の単独公開ページ（chinitsu.html）用として「戻る」ボタンを出さない
export default function ChinitsuTrainer({ onBack, onTimeAttack }) {
  // 出題スーツ(m/p/s)。localStorageに保存して次回以降も維持する
  const [suit, setSuit] = useState(loadSuit);
  const [round, setRound] = useState(initialRound);

  // リロードしても同じ手牌が続くよう、現在の1問を都度保存する
  // 過去の問題の履歴（回答済み・未回答スキップの両方を含む）。「← 前の問題」で遡って
  // 閲覧でき、未回答のまま遡った問題はその場で回答もできる（成績・復習リストにも反映）。
  // 履歴はメモリ内のみ（リロードで消える）・最大 HISTORY_MAX 問
  const [history, setHistory] = useState([]); // {hand, discardedIndex, selectedWaits, result} の配列
  const [historyPos, setHistoryPos] = useState(null); // null=現在の問題を表示中。数値なら履歴の閲覧位置
  const [liveSnapshot, setLiveSnapshot] = useState(null); // 履歴閲覧中に退避しておく「現在の問題」

  // 履歴閲覧中はsessionStorageを上書きしない（リロード復元は常に「現在の問題」）
  useEffect(() => {
    if (historyPos === null) saveChinitsuRound(round);
  }, [round, historyPos]);

  // シェアURLから開いた場合、?q= は初期手牌として消費済みなのでURLから取り除く
  // （残したままだと「次の問題」以降にリロードしたとき再びシェア手牌に戻ってしまう）
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('q')) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  }, []);
  const [result, setResult] = useState(null);
  const [tally, setTally] = useState({ correct: 0, total: 0 });
  // reviewQueue: null = 通常のランダム出題。配列なら復習モード（現在の1問の後に控えている手牌の残り）
  const [reviewQueue, setReviewQueue] = useState(null);
  const [missedCount, setMissedCount] = useState(() => loadMissedProblems().length);

  const { hand, discardedIndex, selectedWaits } = round;
  const answered = result !== null;
  const discarded = discardedIndex != null ? hand[discardedIndex] : null;

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
      if (remapped.bestDiscards) {
        remapped.bestDiscards = remapped.bestDiscards.map(d => ({ tile: remap(d.tile), waits: d.waits.map(remap) }));
      }
      if (remapped.waits) remapped.waits = new Set([...remapped.waits].map(remap));
      if (remapped.actualAnalysis) {
        remapped.actualAnalysis = { ...remapped.actualAnalysis, waits: remapped.actualAnalysis.waits.map(remap) };
      }
      return remapped;
    });
  }

  // 練習モードは復習リストへ「保存」しない（保存はタイムアタックの誤答のみ・ChinitsuTimeAttack）。
  // 復習モード中に正解したら、その問題を復習リストから外すだけ（リストはlocalStorageのみ）
  function recordOutcome(isCorrect) {
    if (isCorrect && reviewQueue !== null) removeMissedProblem(hand);
    setMissedCount(loadMissedProblems().length);
  }

  function startReview() {
    const missed = loadMissedProblems();
    if (missed.length === 0) return;
    // 履歴閲覧中に復習を始めた場合は閲覧状態を解除する（退避中の問題は破棄＝従来の挙動と同じ）
    setHistoryPos(null);
    setLiveSnapshot(null);
    const [first, ...rest] = missed;
    setReviewQueue(rest);
    setRound({ hand: first, discardedIndex: null, selectedWaits: new Set() });
    setResult(null);
  }

  // 復習モードを抜けて通常の練習出題に戻る
  function exitReview() {
    setReviewQueue(null);
    setRound(newRound(suit));
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

  // 回答（ツモ／ノーテン／テンパイ）を評価し、結果表示・成績・復習リストへ反映する。
  // 判定と結果生成は evaluateAnswer（純粋関数）が担い、ここは副作用の配線だけ
  function submitAnswer(action) {
    if (answered) return;
    if (action === 'tenpai' && (!discarded || selectedWaits.size === 0)) return;
    const res = evaluateAnswer(hand, action, discarded, selectedWaits);
    setResult(res);
    setTally(t => ({ correct: t.correct + (res.isCorrect ? 1 : 0), total: t.total + 1 }));
    recordOutcome(res.isCorrect);
  }

  // 解答パネル（正解・不正解ボックス）4種すべての末尾に共通で入れるシェアボタン
  const shareButton = (
    <a
      className="chinitsu-share-btn"
      href={buildShareUrl(hand)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg className="chinitsu-share-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
      </svg>
      この問題をシェア
    </a>
  );

  const HISTORY_MAX = 50;

  function snapshotCurrent() {
    return { hand, discardedIndex, selectedWaits, result };
  }

  function loadEntry(entry) {
    setRound({ hand: entry.hand, discardedIndex: entry.discardedIndex, selectedWaits: entry.selectedWaits });
    setResult(entry.result);
  }

  // 表示中の内容（履歴上で回答した場合の結果を含む）を履歴の現在位置に書き戻す
  function writeBackToHistory(pos) {
    const snapshot = snapshotCurrent();
    setHistory(h => h.map((e, i) => (i === pos ? snapshot : e)));
  }

  const canGoPrev = historyPos === null ? history.length > 0 : historyPos > 0;

  function goPrev() {
    if (!canGoPrev) return;
    if (historyPos === null) {
      setLiveSnapshot(snapshotCurrent());
      loadEntry(history[history.length - 1]);
      setHistoryPos(history.length - 1);
    } else {
      writeBackToHistory(historyPos);
      loadEntry(history[historyPos - 1]);
      setHistoryPos(historyPos - 1);
    }
  }

  function goNext() {
    // 履歴閲覧中: 1つ先へ。最新まで来たら退避しておいた「現在の問題」に復帰する
    if (historyPos !== null) {
      writeBackToHistory(historyPos);
      if (historyPos < history.length - 1) {
        loadEntry(history[historyPos + 1]);
        setHistoryPos(historyPos + 1);
      } else {
        loadEntry(liveSnapshot);
        setLiveSnapshot(null);
        setHistoryPos(null);
      }
      return;
    }
    // 現在の問題を（未回答スキップも含めて）履歴に積んでから次の問題へ
    setHistory(h => {
      const next = [...h, snapshotCurrent()];
      if (next.length > HISTORY_MAX) next.shift();
      return next;
    });
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
        {reviewQueue === null && historyPos === null && (
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

      {/* 常に1行分の高さを確保する（履歴閲覧・復習の出入りで画面全体が上下に動くのを防ぐ） */}
      <p className="chinitsu-review-status">
        {reviewQueue !== null
          ? `復習中（残り${reviewQueue.length + 1}問）`
          : historyPos !== null
            ? `過去の問題を表示中（${historyPos + 1}/${history.length}）`
            : ' '}
      </p>

      <ChinitsuAnswerInput
        hand={hand}
        discardedIndex={discardedIndex}
        selectedWaits={selectedWaits}
        answered={answered}
        onSelectDiscard={selectDiscard}
        onToggleWait={toggleWait}
        onTsumo={() => submitAnswer('tsumo')}
        onNoten={() => submitAnswer('noten')}
        onSubmit={() => submitAnswer('tenpai')}
      />

      {answered && (
        <ChinitsuAnswerResult result={result} discarded={discarded} footer={shareButton} />
      )}

      <div className="problem-nav">
        {reviewQueue === null && (
          <button className="btn-nav" onClick={goPrev} disabled={!canGoPrev}>
            ← 前の問題
          </button>
        )}
        <button className="btn-nav btn-nav--finish" onClick={goNext}>
          次の問題 →
        </button>
      </div>

      {historyPos === null && (
        reviewQueue !== null ? (
          // 復習モード: 練習モードへ戻る／タイムアタックへ を横並びで表示（周囲に合わせ全幅）
          <div className="chinitsu-ta-actions chinitsu-ta-actions--full">
            <button className="chinitsu-review-btn" onClick={exitReview}>📖 練習モードへ</button>
            <button className="chinitsu-timeattack-btn" onClick={onTimeAttack}>⏱ タイムアタック</button>
          </div>
        ) : (
          <>
            {missedCount > 0 && (
              <button className="chinitsu-review-btn" onClick={startReview}>
                間違えた問題を復習（{missedCount}問）
              </button>
            )}
            <button className="chinitsu-timeattack-btn" onClick={onTimeAttack}>
              ⏱ タイムアタックに挑戦（3分で何問解ける？）
            </button>
          </>
        )
      )}
    </div>
  );
}
