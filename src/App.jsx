import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import CategoryList from './components/CategoryList';
import ProblemView from './components/ProblemView';
import { getMajorCategory } from './utils/categoryUtils';
import { fromDb } from './utils/problemMapper';
import './App.css';

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const [randomMode, setRandomMode] = useState(() => localStorage.getItem('randomMode') !== 'false');
  const [unansweredOnlyMode, setUnansweredOnlyMode] = useState(() => localStorage.getItem('unansweredOnlyMode') === 'true');
  const [wrongOnlyMode, setWrongOnlyMode] = useState(() => localStorage.getItem('wrongOnlyMode') === 'true');
  const restoredRef = useRef(false);
  const [session, setSession] = useState(null);
  const [isAllowed, setIsAllowed] = useState(null);
  const [allowedMajorCategories, setAllowedMajorCategories] = useState(null);
  const [results, setResults] = useState({});

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
    try {
      if (sessionStorage.getItem('isPlaying') !== 'true') return;
      const savedIds = JSON.parse(sessionStorage.getItem('orderedIds') ?? '[]');
      const savedIndex = parseInt(sessionStorage.getItem('currentIndex') ?? '0');
      const restored = savedIds.map(id => problems.find(p => p.id === id)).filter(Boolean);
      if (restored.length > 0) {
        setOrderedProblems(restored);
        setCurrentIndex(savedIndex);
        setIsPlaying(true);
        setPlayingKey(k => k + 1);
      }
    } catch { /* sessionStorage 読み込み失敗時は無視 */ }
  }, [loading, problems]);

  const visibleProblems = allowedMajorCategories
    ? problems.filter(p => allowedMajorCategories.includes(getMajorCategory(p.section)))
    : problems;

  const categories = [...new Set(visibleProblems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  function startSelected(sections) {
    let catProblems = visibleProblems.filter(p => sections.has(p.section));
    if (unansweredOnlyMode || wrongOnlyMode) {
      catProblems = catProblems.filter(p => {
        if (unansweredOnlyMode && results[p.id] === undefined) return true;
        if (wrongOnlyMode && results[p.id] === false) return true;
        return false;
      });
    }
    const ordered = randomMode ? shuffled(catProblems) : catProblems;
    setOrderedProblems(ordered);
    setIsPlaying(true);
    setPlayingKey(k => k + 1);
    setCurrentIndex(0);
    sessionStorage.setItem('isPlaying', 'true');
    sessionStorage.setItem('orderedIds', JSON.stringify(ordered.map(p => p.id)));
    sessionStorage.setItem('currentIndex', '0');
  }

  function backToCategories() {
    setIsPlaying(false);
    setOrderedProblems([]);
    setCurrentIndex(0);
    sessionStorage.removeItem('isPlaying');
    sessionStorage.removeItem('orderedIds');
    sessionStorage.removeItem('currentIndex');
  }

  function renderContent() {
    if (session && isAllowed === null) {
      return <div style={{ padding: 32, textAlign: 'center' }}>読み込み中...</div>;
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
      return <div style={{ padding: 32, textAlign: 'center' }}>読み込み中...</div>;
    }
    if (!isPlaying) {
      return (
        <CategoryList
          categories={categories}
          problems={visibleProblems}
          randomMode={randomMode}
          onToggleRandom={() => setRandomMode(m => { localStorage.setItem('randomMode', String(!m)); return !m; })}
          unansweredOnlyMode={unansweredOnlyMode}
          onToggleUnansweredOnly={() => setUnansweredOnlyMode(m => { localStorage.setItem('unansweredOnlyMode', String(!m)); return !m; })}
          wrongOnlyMode={wrongOnlyMode}
          onToggleWrongOnly={() => setWrongOnlyMode(m => { localStorage.setItem('wrongOnlyMode', String(!m)); return !m; })}
          onStart={startSelected}
          results={results}
          session={session}
          onResetResults={handleResetResults}
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
        onPrev={() => setCurrentIndex((i) => { sessionStorage.setItem('currentIndex', String(i - 1)); return i - 1; })}
        onNext={() => setCurrentIndex((i) => { sessionStorage.setItem('currentIndex', String(i + 1)); return i + 1; })}
        onAnswer={handleAnswer}
      />
    );
  }

  return (
    <>
      <header className="app-header">
        <span className="app-header-title">麻雀 何切る問題集</span>
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
