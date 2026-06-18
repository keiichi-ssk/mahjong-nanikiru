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

export default function App() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(null);

  useEffect(() => {
    supabase.from('problems').select('*').order('id')
      .then(({ data }) => {
        setProblems((data || []).map(fromDb));
        setLoading(false);
      });
  }, []);

  const categories = [...new Set(problems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  const categoryProblems = selectedCategory
    ? problems.filter((p) => p.section === selectedCategory)
    : [];

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
