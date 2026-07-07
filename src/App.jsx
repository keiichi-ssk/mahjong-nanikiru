import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './lib/supabase';
import CategoryList from './components/CategoryList';
import ProblemView from './components/ProblemView';
import SessionSummary from './components/SessionSummary';
import { isSectionAllowed } from './utils/categoryUtils';
import { fromDb } from './utils/problemMapper';
import {
  saveRoundStart, saveRoundRetry, clearRound, loadRound,
  saveCurrentIndex, saveRoundResults, saveRoundAnswers,
  saveSessionFirstResults, saveShowSummary,
} from './utils/roundStorage';
import './App.css';

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// localStorage に保存される ON/OFF 設定（シャッフル出題・未回答のみ等）
function useLocalStorageToggle(key, defaultValue) {
  const [on, setOn] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored === 'true';
  });
  const toggle = useCallback(() => {
    setOn(prev => {
      localStorage.setItem(key, String(!prev));
      return !prev;
    });
  }, [key]);
  return [on, toggle];
}

function LoadingSkeleton() {
  return (
    <div className="loading-skeleton" role="status" aria-label="読み込み中">
      <div className="skeleton-block skeleton-toggle" />
      <div className="skeleton-tabs">
        <div className="skeleton-block skeleton-tab" />
        <div className="skeleton-block skeleton-tab" />
        <div className="skeleton-block skeleton-tab" />
      </div>
      <div className="skeleton-block skeleton-heading" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton-block skeleton-card" />
      ))}
    </div>
  );
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) console.error('OAuth error:', error);
}

export default function App() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingKey, setPlayingKey] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [orderedProblems, setOrderedProblems] = useState([]);
  const [randomMode, toggleRandomMode] = useLocalStorageToggle('randomMode', true);
  const [unansweredOnlyMode, toggleUnansweredOnlyMode] = useLocalStorageToggle('unansweredOnlyMode', false);
  const [wrongOnlyMode, toggleWrongOnlyMode] = useLocalStorageToggle('wrongOnlyMode', false);
  const restoredRef = useRef(false);
  const [session, setSession] = useState(null);
  const [isAllowed, setIsAllowed] = useState(null);
  const [allowedMajorCategories, setAllowedMajorCategories] = useState(null);
  const [results, setResults] = useState({});
  // 今ラウンド（現在の出題一巡）の正誤。サマリー表示と再挑戦の抽出に使う
  const [roundResults, setRoundResults] = useState({});
  // 今ラウンドの回答内容（選んだ牌・リーチ選択・スーツ置換マップ）。
  // リロードや「前の問題」で戻ったときに回答済み状態を復元するために使う
  const [roundAnswers, setRoundAnswers] = useState({});
  // セッション内で最初に回答したときの正誤。DBへはこの1度目だけを記録する
  // （再挑戦で正解しても1度目の誤答を保持し、次回セッションで復習できるようにする）
  const [sessionFirstResults, setSessionFirstResults] = useState({});
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setIsAllowed(null); setAllowedMajorCategories(null); return; }
    supabase
      .from('allowed_users')
      .select('email, allowed_major_categories')
      .eq('email', session.user.email)
      .single()
      .then(({ data }) => {
        setIsAllowed(!!data);
        setAllowedMajorCategories(data?.allowed_major_categories ?? null);
      });
  }, [session]);

  useEffect(() => {
    if (!session) { setResults({}); return; }
    supabase
      .from('user_results')
      .select('problem_id, correct')
      .eq('user_id', session.user.id)
      .then(({ data, error }) => {
        if (error) { console.error('[results fetch]', error); return; }
        const map = {};
        (data || []).forEach(r => { map[r.problem_id] = r.correct; });
        setResults(map);
      });
  }, [session]);

  async function handleAnswer(problemId, isCorrect) {
    const nextRound = { ...roundResults, [problemId]: isCorrect };
    setRoundResults(nextRound);
    saveRoundResults(nextRound);

    // セッション内2回目以降の回答（再挑戦・前に戻っての答え直し）はDBに記録しない
    if (problemId in sessionFirstResults) return;
    const nextFirst = { ...sessionFirstResults, [problemId]: isCorrect };
    setSessionFirstResults(nextFirst);
    saveSessionFirstResults(nextFirst);

    if (!session) return;
    setResults(prev => ({ ...prev, [problemId]: isCorrect }));
    const { error } = await supabase
      .from('user_results')
      .upsert(
        { user_id: session.user.id, problem_id: problemId, correct: isCorrect },
        { onConflict: 'user_id,problem_id' }
      );
    if (error) console.error('[handleAnswer]', error);
  }

  function persistAnswer(problemId, payload) {
    const next = { ...roundAnswers, [problemId]: payload };
    setRoundAnswers(next);
    saveRoundAnswers(next);
  }

  async function handleResetResults(problemIds) {
    if (!session || !problemIds.length) return;
    setResults(prev => {
      const next = { ...prev };
      problemIds.forEach(id => delete next[id]);
      return next;
    });
    const { error } = await supabase
      .from('user_results')
      .delete()
      .eq('user_id', session.user.id)
      .in('problem_id', problemIds);
    if (error) console.error('[handleResetResults]', error);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from('problems').select('*').order('id')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setLoading(false); return; }
        setProblems((data || []).map(fromDb).filter(p => !p.disabled));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    if (loading || problems.length === 0 || restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadRound();
    if (!saved.isPlaying) return;
    const restored = saved.orderedIds.map(id => problems.find(p => p.id === id)).filter(Boolean);
    if (restored.length > 0) {
      setOrderedProblems(restored);
      setCurrentIndex(saved.currentIndex);
      setRoundResults(saved.roundResults);
      setRoundAnswers(saved.roundAnswers);
      setSessionFirstResults(saved.sessionFirstResults);
      setShowSummary(saved.showSummary);
      setIsPlaying(true);
      setPlayingKey(k => k + 1);
    }
  }, [loading, problems]);

  const visibleProblems = allowedMajorCategories
    ? problems.filter(p => isSectionAllowed(allowedMajorCategories, p.section))
    : problems;

  const categories = [...new Set(visibleProblems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  function startSelected(sections, count = null) {
    let catProblems = visibleProblems.filter(p => sections.has(p.section));
    if (unansweredOnlyMode || wrongOnlyMode) {
      catProblems = catProblems.filter(p => {
        if (unansweredOnlyMode && results[p.id] === undefined) return true;
        if (wrongOnlyMode && results[p.id] === false) return true;
        return false;
      });
    }
    let ordered = randomMode ? shuffled(catProblems) : catProblems;
    // 出題数の指定があれば先頭から絞る（ランダムON時はシャッフル後なので実質ランダム抽出）
    if (count != null && count < ordered.length) {
      ordered = ordered.slice(0, count);
    }
    setOrderedProblems(ordered);
    setIsPlaying(true);
    setPlayingKey(k => k + 1);
    setCurrentIndex(0);
    setRoundResults({});
    setRoundAnswers({});
    setSessionFirstResults({});
    setShowSummary(false);
    saveRoundStart(ordered.map(p => p.id));
  }

  function finishRound() {
    setShowSummary(true);
    saveShowSummary(true);
  }

  // 今ラウンドで間違えた問題だけで新しいラウンドを開始する
  // （sessionFirstResults は保持 = DBへの記録は1度目のまま）
  function retryWrong() {
    const wrong = orderedProblems.filter(p => roundResults[p.id] === false);
    if (wrong.length === 0) return;
    const ordered = randomMode ? shuffled(wrong) : wrong;
    setOrderedProblems(ordered);
    setCurrentIndex(0);
    setRoundResults({});
    setRoundAnswers({});
    setShowSummary(false);
    setPlayingKey(k => k + 1);
    saveRoundRetry(ordered.map(p => p.id));
  }

  function backToCategories() {
    setIsPlaying(false);
    setOrderedProblems([]);
    setCurrentIndex(0);
    setRoundResults({});
    setRoundAnswers({});
    setSessionFirstResults({});
    setShowSummary(false);
    clearRound();
  }

  function renderContent() {
    if (session && isAllowed === null) {
      return <LoadingSkeleton />;
    }
    if (session && isAllowed === false) {
      return (
        <div className="access-denied">
          <p className="access-denied-title">アクセス権がありません</p>
          <p className="access-denied-sub">このアプリは限定公開です。</p>
          <button className="btn-logout" onClick={() => supabase.auth.signOut()}>
            ログアウト
          </button>
        </div>
      );
    }
    if (loading) {
      return <LoadingSkeleton />;
    }
    if (!isPlaying) {
      return (
        <CategoryList
          categories={categories}
          problems={visibleProblems}
          randomMode={randomMode}
          onToggleRandom={toggleRandomMode}
          unansweredOnlyMode={unansweredOnlyMode}
          onToggleUnansweredOnly={toggleUnansweredOnlyMode}
          wrongOnlyMode={wrongOnlyMode}
          onToggleWrongOnly={toggleWrongOnlyMode}
          onStart={startSelected}
          results={results}
          session={session}
          onResetResults={handleResetResults}
        />
      );
    }
    if (showSummary) {
      return (
        <SessionSummary
          problems={orderedProblems}
          roundResults={roundResults}
          onRetryWrong={retryWrong}
          onBack={backToCategories}
        />
      );
    }
    return (
      <ProblemView
        key={`${playingKey}-${currentIndex}`}
        problem={orderedProblems[currentIndex]}
        index={currentIndex}
        total={orderedProblems.length}
        onBack={backToCategories}
        onPrev={() => setCurrentIndex((i) => { saveCurrentIndex(i - 1); return i - 1; })}
        onNext={() => setCurrentIndex((i) => { saveCurrentIndex(i + 1); return i + 1; })}
        onFinish={finishRound}
        onAnswer={handleAnswer}
        savedAnswer={roundAnswers[orderedProblems[currentIndex].id]}
        onPersistAnswer={persistAnswer}
      />
    );
  }

  return (
    <>
      <header className="app-header">
        <span className="app-header-title">座学する麻雀</span>
        {session ? (
          <div className="user-info">
            {session.user.user_metadata?.avatar_url && (
              <img
                src={session.user.user_metadata.avatar_url}
                alt="avatar"
                className="user-avatar"
              />
            )}
            <span className="user-name">
              {session.user.user_metadata?.name ?? session.user.email}
            </span>
            <button
              className="btn-logout"
              onClick={() => supabase.auth.signOut()}
            >
              ログアウト
            </button>
          </div>
        ) : (
          <button className="btn-login" onClick={signInWithGoogle}>
            Googleでログイン
          </button>
        )}
      </header>
      {renderContent()}
    </>
  );
}
