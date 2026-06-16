export default function ProblemList({ category, problems, onSelect, onBack }) {
  return (
    <div className="problem-list">
      <div className="problem-list-header">
        <button className="btn-back" onClick={onBack}>← カテゴリー一覧</button>
        <h2 className="category-title">{category.replace(/^\d+_/, '')}</h2>
      </div>
      <p className="problem-list-subtitle">問題を選んでください</p>
      <div className="problem-grid">
        {problems.map((problem, index) => (
          <button
            key={problem.id}
            className="problem-card"
            onClick={() => onSelect(index)}
          >
            <span className="problem-number">問題 {index + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
