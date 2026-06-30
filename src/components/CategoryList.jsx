import { useState } from 'react';
import { groupByBook, sectionLabel } from '../utils/categoryUtils';

export default function CategoryList({ categories, problems, randomMode, onToggleRandom, unansweredOnlyMode, onToggleUnansweredOnly, wrongOnlyMode, onToggleWrongOnly, onStart, results = {}, session, onResetResults }) {
  const books = groupByBook(categories);
  const [checkedSections, setCheckedSections] = useState(new Set());
  const [activeBook, setActiveBook] = useState(() => books[0]?.label ?? '');

  function toggleSection(cat) {
    setCheckedSections(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function toggleGroup(sections) {
    const allChecked = sections.every(s => checkedSections.has(s));
    setCheckedSections(prev => {
      const next = new Set(prev);
      if (allChecked) sections.forEach(s => next.delete(s));
      else sections.forEach(s => next.add(s));
      return next;
    });
  }

  const filterActive = unansweredOnlyMode || wrongOnlyMode;

  function isProblemIncluded(p) {
    if (!filterActive) return true;
    if (unansweredOnlyMode && results[p.id] === undefined) return true;
    if (wrongOnlyMode && results[p.id] === false) return true;
    return false;
  }

  function availableSections(sections) {
    return sections.filter(cat => {
      const catProblems = problems.filter(p => p.section === cat);
      if (filterActive) return catProblems.some(isProblemIncluded);
      return catProblems.length > 0;
    });
  }

  const totalSelectedProblems = problems.filter(p => {
    if (!checkedSections.has(p.section)) return false;
    return isProblemIncluded(p);
  }).length;

  function filterLabel() {
    if (unansweredOnlyMode && wrongOnlyMode) return '未回答・不正解';
    if (unansweredOnlyMode) return '未回答';
    return '不正解';
  }

  const activeBookData = books.find(b => b.label === activeBook) ?? books[0];

  function resetSection(cat, catProblems) {
    if (!window.confirm(`「${sectionLabel(cat)}」の正誤をリセットしますか？`)) return;
    onResetResults(catProblems.map(p => p.id));
  }

  function resetMajor(majorLabel, sections) {
    if (!window.confirm(`「${majorLabel}」の正誤をリセットしますか？`)) return;
    const ids = sections.flatMap(s => problems.filter(p => p.section === s)).map(p => p.id);
    onResetResults(ids);
  }

  function resetBook(bookLabel) {
    if (!window.confirm(`「${bookLabel}」全体の正誤をリセットしますか？`)) return;
    const bookData = books.find(b => b.label === bookLabel);
    if (!bookData) return;
    const ids = bookData.majorGroups
      .flatMap(g => g.sections)
      .flatMap(s => problems.filter(p => p.section === s))
      .map(p => p.id);
    onResetResults(ids);
  }

  return (
    <div className="category-list">

      <div className="toggle-rows">
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
        {session && (
          <>
            <div className="random-toggle-row">
              <span className="random-toggle-label">未回答の問題</span>
              <button
                className={`random-toggle${unansweredOnlyMode ? ' random-toggle--on' : ''}`}
                onClick={onToggleUnansweredOnly}
                role="switch"
                aria-checked={unansweredOnlyMode}
              >
                <span className="random-toggle-thumb" />
              </button>
            </div>
            <div className="random-toggle-row">
              <span className="random-toggle-label">間違えた問題</span>
              <button
                className={`random-toggle${wrongOnlyMode ? ' random-toggle--on' : ''}`}
                onClick={onToggleWrongOnly}
                role="switch"
                aria-checked={wrongOnlyMode}
              >
                <span className="random-toggle-thumb" />
              </button>
            </div>
          </>
        )}
      </div>

      <div className="book-tabs">
        {books.map(({ label: bookLabel, majorGroups }) => {
          const bookSections = majorGroups.flatMap(g => g.sections);
          const selectedCount = bookSections.filter(s => checkedSections.has(s)).length;
          return (
            <button
              key={bookLabel}
              className={`book-tab${activeBook === bookLabel ? ' book-tab--active' : ''}`}
              onClick={() => setActiveBook(bookLabel)}
            >
              {bookLabel}
              {selectedCount > 0 && (
                <span className="book-tab-badge">{selectedCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {activeBookData && activeBookData.majorGroups.length === 0 && (
        <div className="pending-notice">非公開のコンテンツです</div>
      )}

      {activeBookData && activeBookData.majorGroups.length > 0 && (
        <div key={activeBook} className="book-content">
          {session && onResetResults && (() => {
            const bookProblems = activeBookData.majorGroups
              .flatMap(g => g.sections)
              .flatMap(s => problems.filter(p => p.section === s));
            const answeredInBook = bookProblems.filter(p => results[p.id] !== undefined).length;
            return answeredInBook > 0 ? (
              <div className="book-reset-bar">
                <button className="btn-reset-book" onClick={() => resetBook(activeBook)}>
                  「{activeBook}」の正誤をリセット
                </button>
              </div>
            ) : null;
          })()}

          {activeBookData.majorGroups.map(({ label: majorLabel, sections }) => {
            const majorAvailable = availableSections(sections);
            const majorAllChecked = majorAvailable.length > 0 && majorAvailable.every(s => checkedSections.has(s));
            const majorProblems = sections.flatMap(s => problems.filter(p => p.section === s));
            const answeredInMajor = majorProblems.filter(p => results[p.id] !== undefined).length;
            return (
              <div key={majorLabel} className="major-category-group">
                <h3
                  className={`major-category-label major-category-label--selectable${majorAllChecked ? ' major-category-label--checked' : ''}`}
                  onClick={() => majorAvailable.length > 0 && toggleGroup(majorAvailable)}
                >
                  <span>{majorLabel}</span>
                  <div className="major-category-actions">
                    {session && onResetResults && answeredInMajor > 0 && (
                      <button
                        className="btn-reset-major"
                        onClick={(e) => { e.stopPropagation(); resetMajor(majorLabel, sections); }}
                      >
                        正誤をリセット
                      </button>
                    )}
                    <span className={`select-badge${majorAllChecked ? ' select-badge--active' : ''}`}>{majorAllChecked ? '全解除' : '全選択'}</span>
                  </div>
                </h3>
                <div className="category-grid">
                  {sections.map((cat) => {
                    const catProblems = problems.filter((p) => p.section === cat);
                    const totalCount = catProblems.length;
                    const filteredCount = filterActive
                      ? catProblems.filter(isProblemIncluded).length
                      : totalCount;
                    const available = filterActive ? filteredCount > 0 : totalCount > 0;
                    const isChecked = checkedSections.has(cat);
                    const answeredCount = catProblems.filter(p => results[p.id] !== undefined).length;
                    const correctCount = catProblems.filter(p => results[p.id] === true).length;
                    return (
                      <div
                        key={cat}
                        className={`category-card${available ? '' : ' category-card--disabled'}${isChecked ? ' category-card--checked' : ''}`}
                        onClick={() => available && toggleSection(cat)}
                        role="button"
                        tabIndex={available ? 0 : -1}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && available && toggleSection(cat)}
                      >
                        <span className="card-check">{isChecked ? '✓' : ''}</span>
                        <span className="category-name">{sectionLabel(cat)}</span>
                        <span className="category-count">
                          {totalCount === 0
                            ? '準備中'
                            : filterActive
                              ? `${filteredCount}問（${filterLabel()}）`
                              : `${totalCount}問`}
                        </span>
                        {!filterActive && totalCount > 0 && answeredCount > 0 && (
                          <div className="category-progress">
                            <div className="category-progress-bar">
                              <div
                                className="category-progress-fill"
                                style={{ width: `${(correctCount / totalCount) * 100}%` }}
                              />
                            </div>
                            <span className="category-progress-text">
                              {correctCount}/{totalCount}問正解
                            </span>
                          </div>
                        )}
                        {session && onResetResults && answeredCount > 0 && (
                          <button
                            className="btn-reset-section"
                            onClick={(e) => { e.stopPropagation(); resetSection(cat, catProblems); }}
                          >
                            正誤をリセット
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {checkedSections.size > 0 && (
        <div className="start-button-bar">
          <button
            className="btn-start"
            onClick={() => onStart(checkedSections)}
            disabled={totalSelectedProblems === 0}
          >
            出題開始（{totalSelectedProblems}問）
          </button>
        </div>
      )}
    </div>
  );
}
