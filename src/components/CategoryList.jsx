import { groupByBook, sectionLabel } from '../utils/categoryUtils';

export default function CategoryList({ categories, problems, onSelect }) {
  const books = groupByBook(categories);

  return (
    <div className="category-list">
      <h1 className="app-title">麻雀 何切る問題集</h1>
      <p className="problem-list-subtitle">カテゴリーを選んでください</p>
      {books.map(({ label: bookLabel, majorGroups }) => (
        <div key={bookLabel} className="book-group">
          <h2 className="book-label">{bookLabel}</h2>
          {majorGroups.map(({ label: majorLabel, sections }) => (
            <div key={majorLabel} className="major-category-group">
              <h3 className="major-category-label">{majorLabel}</h3>
              <div className="category-grid">
                {sections.map((cat) => {
                  const count = problems.filter((p) => p.section === cat).length;
                  const available = count > 0;
                  return (
                    <button
                      key={cat}
                      className={`category-card${available ? '' : ' category-card--disabled'}`}
                      onClick={() => available && onSelect(cat)}
                      disabled={!available}
                    >
                      <span className="category-name">{sectionLabel(cat)}</span>
                      <span className="category-count">
                        {available ? `${count}問` : '準備中'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
