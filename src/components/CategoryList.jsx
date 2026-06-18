import { groupByBook, sectionLabel } from '../utils/categoryUtils';

export default function CategoryList({ categories, problems, randomMode, onToggleRandom, onSelect, results = {} }) {
  const books = groupByBook(categories);

  return (
    <div className="category-list">
      <h1 className="app-title">麻雀 何切る問題集</h1>
      <div className="random-toggle-row">
        <span className="random-toggle-label">ランダム出題</span>
        <button
          className={`random-toggle${randomMode ? ' random-toggle--on' : ''}`}
          onClick={onToggleRandom}
          role="switch"
          aria-checked={randomMode}
        >
          <span className="random-toggle-thumb" />
        </button>
      </div>
      {books.map(({ label: bookLabel, majorGroups }) => (
        <div key={bookLabel} className="book-group">
          <h2 className="book-label">{bookLabel}</h2>
          {majorGroups.map(({ label: majorLabel, sections }) => (
            <div key={majorLabel} className="major-category-group">
              <h3 className="major-category-label">{majorLabel}</h3>
              <div className="category-grid">
                {sections.map((cat) => {
                  const catProblems = problems.filter((p) => p.section === cat);
                  const count = catProblems.length;
                  const available = count > 0;
                  const answeredCount = catProblems.filter(p => results[p.id] !== undefined).length;
                  const correctCount  = catProblems.filter(p => results[p.id] === true).length;
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
                      {available && answeredCount > 0 && (
                        <div className="category-progress">
                          <div className="category-progress-bar">
                            <div
                              className="category-progress-fill"
                              style={{ width: `${(correctCount / count) * 100}%` }}
                            />
                          </div>
                          <span className="category-progress-text">
                            {correctCount}/{count}問正解
                          </span>
                        </div>
                      )}
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
