function categoryLabel(folderName) {
  return folderName.replace(/^\d+_/, '');
}

export default function CategoryList({ categories, problems, onSelect }) {
  return (
    <div className="category-list">
      <h1 className="app-title">麻雀 何切る問題集</h1>
      <p className="problem-list-subtitle">カテゴリーを選んでください</p>
      <div className="category-grid">
        {categories.map((cat) => {
          const count = problems.filter((p) => p.section === cat).length;
          const available = count > 0;
          return (
            <button
              key={cat}
              className={`category-card${available ? '' : ' category-card--disabled'}`}
              onClick={() => available && onSelect(cat)}
              disabled={!available}
            >
              <span className="category-name">{categoryLabel(cat)}</span>
              <span className="category-count">
                {available ? `${count}問` : '準備中'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
