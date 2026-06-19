import { useState } from 'react';
import { groupByBook, sectionLabel } from '../utils/categoryUtils';

export default function CategoryList({ categories, problems, randomMode, onToggleRandom, mistakesOnlyMode, onToggleMistakesOnly, onStart, results = {}, session }) {
  const books = groupByBook(categories);
  const [checkedSections, setCheckedSections] = useState(new Set());
  const [activeBook, setActiveBook] = useState(null);

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

  function availableSections(sections) {
    return sections.filter(cat => {
      const catProblems = problems.filter(p => p.section === cat);
      if (mistakesOnlyMode) return catProblems.some(p => results[p.id] !== true);
      return catProblems.length > 0;
    });
  }

  const totalSelectedProblems = problems.filter(p => {
    if (!checkedSections.has(p.section)) return false;
    if (mistakesOnlyMode) return results[p.id] !== true;
    return true;
  }).length;

  const activeBookData = books.find(b => b.label === activeBook);

  // ===== 書籍選択画面 =====
  if (!activeBook) {
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
            <div className="random-toggle-row">
              <span className="random-toggle-label">未回答・間違えた問題のみ</span>
              <button
                className={`random-toggle${mistakesOnlyMode ? ' random-toggle--on' : ''}`}
                onClick={onToggleMistakesOnly}
                role="switch"
                aria-checked={mistakesOnlyMode}
              >
                <span className="random-toggle-thumb" />
              </button>
            </div>
          )}
        </div>

        <div className="book-select-list">
          {books.map(({ label: bookLabel, majorGroups }) => {
            const allSections = majorGroups.flatMap(g => g.sections);
            const totalCount = problems.filter(p => allSections.includes(p.section)).length;
            const selectedCount = allSections.filter(s => checkedSections.has(s)).length;
            const correctCount = problems.filter(p => allSections.includes(p.section) && results[p.id] === true).length;
            const answeredCount = problems.filter(p => allSections.includes(p.section) && results[p.id] !== undefined).length;
            const hasProblems = totalCount > 0;
            const progressPct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

            return (
              <button
                key={bookLabel}
                className={`book-select-card${!hasProblems ? ' book-select-card--pending' : ''}${selectedCount > 0 ? ' book-select-card--selected' : ''}`}
                onClick={() => setActiveBook(bookLabel)}
              >
                <div className="book-select-card-header">
                  <span className="book-select-card-title">{bookLabel}</span>
                  {selectedCount > 0 && (
                    <span className="book-select-badge">{selectedCount}章選択中</span>
                  )}
                </div>

                {hasProblems ? (
                  <>
                    <div className="book-select-card-meta">
                      全{majorGroups.length}章 · {totalCount}問
                    </div>
                    {answeredCount > 0 && (
                      <div className="book-select-progress">
                        <div className="book-select-progress-bar">
                          <div
                            className="book-select-progress-fill"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="book-select-progress-text">{correctCount}/{totalCount}問正解</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="book-select-card-meta book-select-card-meta--pending">準備中</div>
                )}

                <span className="book-select-card-arrow">›</span>
              </button>
            );
          })}
        </div>

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

  // ===== カテゴリ選択画面 =====
  return (
    <div className="category-list">
      <div className="book-nav-header">
        <button className="btn-book-back" onClick={() => setActiveBook(null)}>
          ‹ 書籍一覧
        </button>
        <span className="book-nav-title">{activeBook}</span>
      </div>

      {!activeBookData || activeBookData.majorGroups.length === 0 ? (
        <div className="pending-notice">この書籍の問題は準備中です</div>
      ) : (
        <div className="book-content">
          {activeBookData.majorGroups.map(({ label: majorLabel, sections }) => {
            const majorAvailable = availableSections(sections);
            const majorAllChecked = majorAvailable.length > 0 && majorAvailable.every(s => checkedSections.has(s));
            return (
              <div key={majorLabel} className="major-category-group">
                <h3
                  className={`major-category-label major-category-label--selectable${majorAllChecked ? ' major-category-label--checked' : ''}`}
                  onClick={() => majorAvailable.length > 0 && toggleGroup(majorAvailable)}
                >
                  <span>{majorLabel}</span>
                  <span className={`select-badge${majorAllChecked ? ' select-badge--active' : ''}`}>{majorAllChecked ? '全解除' : '全選択'}</span>
                </h3>
                <div className="category-grid">
                  {sections.map((cat) => {
                    const catProblems = problems.filter((p) => p.section === cat);
                    const totalCount = catProblems.length;
                    const filteredCount = mistakesOnlyMode
                      ? catProblems.filter(p => results[p.id] !== true).length
                      : totalCount;
                    const available = filteredCount > 0;
                    const isChecked = checkedSections.has(cat);
                    const answeredCount = catProblems.filter(p => results[p.id] !== undefined).length;
                    const correctCount = catProblems.filter(p => results[p.id] === true).length;
                    return (
                      <button
                        key={cat}
                        className={`category-card${available ? '' : ' category-card--disabled'}${isChecked ? ' category-card--checked' : ''}`}
                        onClick={() => available && toggleSection(cat)}
                        disabled={!available}
                      >
                        {isChecked && <span className="card-check">✓</span>}
                        <span className="category-name">{sectionLabel(cat)}</span>
                        <span className="category-count">
                          {totalCount === 0
                            ? '準備中'
                            : mistakesOnlyMode
                              ? `${filteredCount}問（未回答・不正解）`
                              : `${totalCount}問`}
                        </span>
                        {!mistakesOnlyMode && totalCount > 0 && answeredCount > 0 && (
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
                      </button>
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
