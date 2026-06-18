import { useState, useEffect } from 'react';
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
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [orderedProblems, setOrderedProblems] = useState([]);
  const [randomMode, setRandomMode] = useState(false);
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

  const categories = [...new Set(problems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  function startCategory(cat) {
    const catProblems = problems.filter((p) => p.section === cat);
    setOrderedProblems(randomMode ? shuffled(catProblems) : catProblems);
    setSelectedCategory(cat);
    setCurrentIndex(0);
  }

  function backToCategories() {
    setSelectedCategory(null);
    setOrderedProblems([]);
    setCurrentIndex(0);
  }

  function renderContent() {
    if (loading) {
      return <div style={{ padding: 32, textAlign: 'center' }}>読み込み中...</div>;
    }
    if (selectedCategory === null) {
      return (
        <CategoryList
          categories={categories}
          problems={problems}
          randomMode={randomMode}
          onToggleRandom={() => setRandomMode(m => !m)}
          onSelect={startCategory}
          results={results}
        />
      );
    }
    return (
      <ProblemView
        key={`${selectedCategory}-${currentIndex}`}
        problem={orderedProblems[currentIndex]}
        index={currentIndex}
        total={orderedProblems.length}
        onBack={backToCategories}
        onPrev={() => setCurrentIndex((i) => i - 1)}
        onNext={() => setCurrentIndex((i) => i + 1)}
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
