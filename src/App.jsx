import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import CategoryList from './components/CategoryList';
import ProblemList from './components/ProblemList';
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
  const [currentIndex, setCurrentIndex] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    supabase.from('problems').select('*').order('id')
      .then(({ data }) => {
        setProblems((data || []).map(fromDb));
        setLoading(false);
      });
  }, [session]);

  const categories = [...new Set(problems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  const categoryProblems = selectedCategory
    ? problems.filter((p) => p.section === selectedCategory)
    : [];

  function renderContent() {
    if (loading) {
      return <div style={{ padding: 32, textAlign: 'center' }}>読み込み中...</div>;
    }
    if (selectedCategory === null) {
      return (
        <CategoryList
          categories={categories}
          problems={problems}
          onSelect={(cat) => setSelectedCategory(cat)}
        />
      );
    }
    if (currentIndex === null) {
      return (
        <ProblemList
          category={selectedCategory}
          problems={categoryProblems}
          onSelect={(index) => setCurrentIndex(index)}
          onBack={() => setSelectedCategory(null)}
        />
      );
    }
    return (
      <ProblemView
        key={currentIndex}
        problem={categoryProblems[currentIndex]}
        index={currentIndex}
        total={categoryProblems.length}
        onBack={() => setCurrentIndex(null)}
        onPrev={() => setCurrentIndex((i) => i - 1)}
        onNext={() => setCurrentIndex((i) => i + 1)}
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
