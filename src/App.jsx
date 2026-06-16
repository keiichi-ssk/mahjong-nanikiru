import { useState } from 'react';
import problems from './data/problems.json';
import categories from './data/categories.json';
import CategoryList from './components/CategoryList';
import ProblemList from './components/ProblemList';
import ProblemView from './components/ProblemView';
import './App.css';

export default function App() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(null);

  const categoryProblems = selectedCategory
    ? problems.filter((p) => p.section === selectedCategory)
    : [];

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
