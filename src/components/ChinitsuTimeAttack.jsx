import { useState, useEffect, useRef } from 'react';
import ChinitsuAnswerInput from './ChinitsuAnswerInput';
import ChinitsuAnswerResult from './ChinitsuAnswerResult';
import ChinitsuLeaderboard from './ChinitsuLeaderboard';
import { generateChinitsuHand, evaluateAnswer } from '../utils/chinitsuUtils';
import { buildTimeAttackShareUrl } from '../utils/chinitsuShare';
import { fetchTodayRanking, submitScore } from '../utils/leaderboardApi';
import { rankForScore, MAX_NAME_LENGTH } from '../utils/leaderboardUtils';

// 前回入力したニックネームを localStorage から復元する（任意入力・公開ページでも動く）
const PLAYER_NAME_KEY = 'chinitsuPlayerName';
function loadPlayerName() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) || '';
  } catch {
    return '';
  }
}

// メンチン何切る タイムアタックモード。3分の持ち時間で正答数を競う独立モード。
// - タイマーは「回答中」（問題表示中〜回答確定まで）だけ進む。解答パネル表示中・次問への遷移中は停止する
// - 正解 → 正答数+1、誤答 → このセッションの誤答リストに追加（終了後にそのまま復習できる）。どちらも終了せず次の問題へ
// - 回答後は通常モードと同じ解答パネル（解説）を表示し、ユーザーが「次の問題へ」で進める（この間タイマー停止）
// - 3分（回答中の累計）を使い切ったら終了。進行中の問題は正答数に数えない
// 通常モード（ChinitsuTrainer）とは状態を共有せず、sessionStorage 保存もしない（一発勝負・リロードで消える）

const TOTAL_MS = 3 * 60 * 1000; // 持ち時間3分
const SUIT_CODES = ['m', 'p', 's'];

function randomSuit() {
  return SUIT_CODES[Math.floor(Math.random() * SUIT_CODES.length)];
}

function newRound() {
  // タイムアタックは毎問スーツもランダム（難易度と見た目の変化を出す）
  return { hand: generateChinitsuHand(randomSuit()), discardedIndex: null, selectedWaits: new Set() };
}

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ChinitsuTimeAttack({ onBack, onPractice, onReview }) {
  const [phase, setPhase] = useState('ready'); // 'ready' | 'playing' | 'finished'
  const [round, setRound] = useState(newRound);
  const [result, setResult] = useState(null); // null=回答中。judge結果オブジェクトなら解答パネル表示中（タイマー停止）
  const [score, setScore] = useState(0);
  const [remainingMs, setRemainingMs] = useState(TOTAL_MS);
  // このセッション（今回のタイムアタック）で誤答した手牌。終了後の復習はこれだけを対象にする。
  // 永続化せず、次のゲーム開始でリセットする（＝直前のタイムアタックの誤答のみ復習）
  const [missedHands, setMissedHands] = useState([]);

  // デイリーランキング（結果画面で表示・登録）
  const [playerName, setPlayerName] = useState(loadPlayerName); // ニックネーム（任意）
  const [honeypot, setHoneypot] = useState('');                 // bot 対策の隠しフィールド（人間は常に空）
  const [ranking, setRanking] = useState([]);
  const [rankingStatus, setRankingStatus] = useState('idle');   // 'idle'|'loading'|'loaded'|'error'
  const [submitStatus, setSubmitStatus] = useState('idle');     // 'idle'|'sending'|'done'|'error'
  const [myEntryId, setMyEntryId] = useState(null);             // 登録した自分の行ID（ハイライト用）

  const { hand, discardedIndex, selectedWaits } = round;
  const answering = phase === 'playing' && result === null;
  const discarded = discardedIndex != null ? hand[discardedIndex] : null;

  // タイマー: 「回答中」のときだけ実時間ぶんを減算する（Date.now の差分で正確に計る）。
  // 残り時間は ref にも持ち、interval コールバック内で 0 到達を検知して終了させる
  // （effect 本体で同期的に setState しないための構成）。
  const lastTickRef = useRef(0);
  const remainingRef = useRef(TOTAL_MS);
  useEffect(() => {
    if (!answering) return;
    lastTickRef.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      const next = Math.max(0, remainingRef.current - delta);
      remainingRef.current = next;
      setRemainingMs(next);
      if (next <= 0) finishGame();
    }, 100);
    return () => clearInterval(id);
  }, [answering]);

  // 結果画面に入ったら「今日のランキング」を取得する（登録前でも今日のトップを見せて挑戦意欲を促す）。
  // 再挑戦のたびに finished へ戻るので、その都度最新を取り直す。
  // ※ loading への遷移は finishGame()（イベントコールバック）側で行い、effect 本体では
  //   同期 setState をしない（cascading render を避けるため。fetch の結果反映は非同期コールバック）。
  useEffect(() => {
    if (phase !== 'finished') return;
    let cancelled = false;
    fetchTodayRanking()
      .then(list => { if (!cancelled) { setRanking(list); setRankingStatus('loaded'); } })
      .catch(() => { if (!cancelled) setRankingStatus('error'); });
    return () => { cancelled = true; };
  }, [phase]);

  // ゲーム終了（時間切れ／「← 終了」）。結果画面へ移り、ランキングを読み込み中状態にする
  function finishGame() {
    setRanking([]);
    setRankingStatus('loading');
    setPhase('finished');
  }

  function startGame() {
    setScore(0);
    setMissedHands([]);
    setSubmitStatus('idle');
    setMyEntryId(null);
    remainingRef.current = TOTAL_MS;
    setRemainingMs(TOTAL_MS);
    setResult(null);
    setRound(newRound());
    setPhase('playing');
  }

  // 今回のスコアをランキングに登録する。登録後は名前を localStorage に覚え、最新のランキングを取り直す。
  async function handleRegister() {
    if (submitStatus === 'sending' || submitStatus === 'done') return;
    setSubmitStatus('sending');
    const trimmed = playerName.trim();
    try {
      if (trimmed) {
        try { localStorage.setItem(PLAYER_NAME_KEY, trimmed); } catch { /* localStorage不可でも無視 */ }
      }
      const { id } = await submitScore({ name: trimmed || null, score, website: honeypot });
      setMyEntryId(id);
      setSubmitStatus('done');
      // 自分の記録を含めた最新のランキングに更新する
      const list = await fetchTodayRanking();
      setRanking(list);
      setRankingStatus('loaded');
    } catch {
      setSubmitStatus('error');
    }
  }

  function goNext() {
    setResult(null);
    setRound(newRound());
  }

  function selectDiscard(index) {
    if (!answering) return;
    setRound(r => ({ ...r, discardedIndex: index }));
  }

  function toggleWait(tile) {
    if (!answering) return;
    setRound(r => {
      const next = new Set(r.selectedWaits);
      next.has(tile) ? next.delete(tile) : next.add(tile);
      return { ...r, selectedWaits: next };
    });
  }

  // 回答を評価し、解答パネル表示に移る（判定・結果生成は evaluateAnswer が担う）。
  // 正解は正答数+1、誤答はこのセッションの誤答リストに追加（終了後の「間違えた問題を復習」で再挑戦できる）
  function submitAnswer(action) {
    if (!answering) return;
    if (action === 'tenpai' && (!discarded || selectedWaits.size === 0)) return;
    const res = evaluateAnswer(hand, action, discarded, selectedWaits);
    if (res.isCorrect) setScore(s => s + 1);
    else setMissedHands(m => [...m, hand]);
    setResult(res);
  }

  if (phase === 'ready') {
    return (
      <div className="problem-view chinitsu-ta">
        <div className="problem-header">
          {onBack ? (
            <button className="btn-back" onClick={onBack}>← 戻る</button>
          ) : (
            <span />
          )}
        </div>

        <div className="chinitsu-ta-intro">
          <h2 className="chinitsu-ta-title">⏱ メンチン何切る タイムアタック</h2>
          <p className="chinitsu-ta-lead">3分間で何問正解できるか挑戦しよう！</p>

          <p className="chinitsu-ta-section-label">遊び方</p>
          <ul className="chinitsu-instruction-list">
            <li>既にアガリの場合 → 「ツモ」</li>
            <li>どの牌を切ってもテンパイしない場合 → 「ノーテン」</li>
            <li>テンパイが取れる場合 → 切る牌と待ち牌をすべて選んで「回答する」</li>
            <li>正解は受け入れ枚数（待ち牌の残り枚数）が最大になる打牌。同じ枚数なら高打点が見込める方が正解</li>
          </ul>

          <div className="chinitsu-ta-actions">
            <button className="chinitsu-ta-start-btn" onClick={startGame}>スタート</button>
            <button className="chinitsu-review-btn" onClick={onPractice}>📖 練習モードで解く</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'finished') {
    // 今回のセッションで誤答した問題があれば、結果画面から復習モードへ直接入れるボタンを出す
    const missedCount = missedHands.length;
    return (
      <div className="problem-view chinitsu-ta">
        <div className="problem-header">
          {onBack ? (
            <button className="btn-back" onClick={onBack}>← 戻る</button>
          ) : (
            <span />
          )}
        </div>

        <div className="chinitsu-ta-result">
          <p className="chinitsu-ta-result-label">3分間の結果</p>
          <p className="chinitsu-ta-result-score"><strong>{score}</strong><span>問正解</span></p>

          {/* デイリーランキングへの登録 */}
          <div className="chinitsu-lb-register">
            {submitStatus === 'done' ? (
              <p className="chinitsu-lb-registered">
                今日のランキングに登録しました！ 現在 <strong>{rankForScore(ranking, score)}位</strong>
              </p>
            ) : (
              <>
                <p className="chinitsu-lb-register-label">今日のランキングに登録する</p>
                <div className="chinitsu-lb-register-row">
                  <input
                    className="chinitsu-lb-name-input"
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="ニックネーム（任意）"
                    maxLength={MAX_NAME_LENGTH}
                    disabled={submitStatus === 'sending'}
                  />
                  <button
                    className="chinitsu-lb-register-btn"
                    onClick={handleRegister}
                    disabled={submitStatus === 'sending'}
                  >
                    {submitStatus === 'sending' ? '登録中…' : 'ランキングに登録'}
                  </button>
                </div>
                {/* honeypot: 画面に見せない。bot が埋めたらサーバー側で捨てる */}
                <input
                  className="chinitsu-lb-honeypot"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
                {submitStatus === 'error' && (
                  <p className="chinitsu-lb-status chinitsu-lb-status--error">
                    登録できませんでした。時間をおいてお試しください。
                  </p>
                )}
              </>
            )}
          </div>

          {/* 今日のランキング */}
          <p className="chinitsu-lb-heading">🏆 今日のランキング</p>
          <ChinitsuLeaderboard
            entries={ranking}
            highlightId={myEntryId}
            loading={rankingStatus === 'loading'}
            error={rankingStatus === 'error'}
          />

          <a
            className="chinitsu-share-btn"
            href={buildTimeAttackShareUrl(score)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg className="chinitsu-share-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
            </svg>
            結果をシェア
          </a>

          <div className="chinitsu-ta-actions">
            <button className="chinitsu-ta-start-btn" onClick={startGame}>もう一度挑戦</button>
            <button className="chinitsu-review-btn" onClick={onPractice}>📖 練習モードへ</button>
          </div>

          {missedCount > 0 && (
            <button className="chinitsu-review-btn" onClick={() => onReview(missedHands)}>
              間違えた問題を復習（{missedCount}問）
            </button>
          )}
        </div>
      </div>
    );
  }

  const remainingRatio = Math.max(0, remainingMs / TOTAL_MS);
  const timeLow = remainingMs <= 30000; // 残り30秒で警告色

  return (
    <div className="problem-view chinitsu-ta">
      <div className="problem-header">
        <button className="btn-back" onClick={finishGame}>← 終了</button>
        <div className="problem-header-right">
          <span className="problem-counter">正解 {score}問</span>
        </div>
      </div>

      <div className={`chinitsu-ta-timer ${timeLow ? 'chinitsu-ta-timer--low' : ''}`}>
        <div className="chinitsu-ta-timer-bar">
          <div className="chinitsu-ta-timer-fill" style={{ width: `${remainingRatio * 100}%` }} />
        </div>
        <span className="chinitsu-ta-timer-text">残り {formatTime(remainingMs)}</span>
      </div>

      <ChinitsuAnswerInput
        hand={hand}
        discardedIndex={discardedIndex}
        selectedWaits={selectedWaits}
        answered={result !== null}
        onSelectDiscard={selectDiscard}
        onToggleWait={toggleWait}
        onTsumo={() => submitAnswer('tsumo')}
        onNoten={() => submitAnswer('noten')}
        onSubmit={() => submitAnswer('tenpai')}
      />

      {result !== null && (
        <>
          <ChinitsuAnswerResult result={result} discarded={discarded} />
          <div className="problem-nav">
            <button className="btn-nav btn-nav--finish" onClick={goNext}>
              次の問題へ →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
