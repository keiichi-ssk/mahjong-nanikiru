import { BOOKS, getBookLabel } from '../utils/categoryUtils';

export default function BookSelectView({ problems, onSelectBook }) {
  return (
    <div className="book-select-view">
      <p className="book-select-subtitle">カテゴリを選んでください</p>
      <div className="book-select-list">
        {BOOKS.map(({ label }) => {
          const count = problems.filter(p => getBookLabel(p.section) === label).length;
          return (
            <button
              key={label}
              className="book-select-card"
              onClick={() => onSelectBook(label)}
            >
              <span className="book-select-name">{label}</span>
              <span className="book-select-meta">{count}問</span>
              <span className="book-select-arrow">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
