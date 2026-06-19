import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import CategoryList from './components/CategoryList';
import ProblemView from './components/ProblemView';
import './App.css';

function fromDb(p) {
  return {
    ...p,
    problemType:   p.problem_type,
    discardedTile: p.discarded_tile,
    nakiChoices:   p.naki_choices,
  }
}

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
  const [mistakesOnlyMode, setMistakesOnlyMode] = useState(() => localStorage.getItem('mistakesOnlyMode') !== 'false');
  const restoredRef = useRef(false);
  const [session, setSession] = useState(null);
  const [results, setResults] = useState({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setResults({}); return; }
    supabase
      .from('user_results')
      .select('problem_id, is_correct')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => { map[r.problem_id] = r.is_correct; });
        setResults(map);
      });
  }, [session]);

  async function handleAnswer(problemId, isCorrect) {
    if (!session) return;
    setResults(prev => ({ ...prev, [problemId]: isCorrect }));
    await supabase.from('user_results').upsert(
      { user_id: session.user.id, problem_id: problemId, is_correct: isCorrect, answered_at: new Date().toISOString() },
      { onConflict: 'user_id,problem_id' }
    );
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from('problems').select('*').order('id')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setLoading(false); return; }
        setProblems((data || []).map(fromDb));
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

  const categories = [...new Set(problems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  function startSelected(sections) {
    let catProblems = problems.filter(p => sections.has(p.section));
    if (mistakesOnlyMode) {
      catProblems = catProblems.filter(p => results[p.id] !== true);
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
    if (loading) {
      return <div style={{ padding: 32, textAlign: 'center' }}>読み込み中...</div>;
    }
    if (!isPlaying) {
      return (
        <CategoryList
          categories={categories}
          problems={problems}
          randomMode={randomMode}
          onToggleRandom={() => setRandomMode(m => { localStorage.setItem('randomMode', String(!m)); return !m; })}
          mistakesOnlyMode={mistakesOnlyMode}
          onToggleMistakesOnly={() => setMistakesOnlyMode(m => { localStorage.setItem('mistakesOnlyMode', String(!m)); return !m; })}
          onStart={startSelected}
          results={results}
          session={session}
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
