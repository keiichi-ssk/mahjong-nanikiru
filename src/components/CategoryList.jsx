import { useState, useMemo } from 'react';
import { groupByBook, sectionLabel } from '../utils/categoryUtils';
import { useTap } from '../utils/useTap';

function ToggleRow({ label, checked, onToggle }) {
  // 縦に並ぶトグルを素早く連続タップすると、ダブルタップ結合で
  // 2回目のタップが1つ目のトグルに誤配送されるため useTap で処理する
  const labelTap = useTap(onToggle);
  const switchTap = useTap(onToggle);
  return (
    <div className="random-toggle-row">
      <span className="random-toggle-label" {...labelTap}>{label}</span>
      <button
        className={`random-toggle${checked ? ' random-toggle--on' : ''}`}
        {...switchTap}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span className="random-toggle-thumb" />
      </button>
    </div>
  );
}

function CategoryCard({ label, available, isChecked, countText, answeredCount, correctCount, totalCount, showReset, onToggle, onReset }) {
  const tap = useTap(onToggle, { disabled: !available });
  return (
    <div
      className={`category-card${available ? '' : ' category-card--disabled'}${isChecked ? ' category-card--checked' : ''}`}
      {...tap}
      role="button"
      tabIndex={available ? 0 : -1}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && available && onToggle()}
    >
      <span className="card-check">{isChecked ? '✓' : ''}</span>
      <span className="category-name">{label}</span>
      <span className="category-count">{countText}</span>
      {totalCount > 0 && answeredCount > 0 && (
        <div className="category-card-status">
          <div className="category-progress">
            <div className="category-progress-bar">
              <div
                className="category-progress-fill"
                style={{ width: `${(correctCount / totalCount) * 100}%` }}
              />
            </div>
            <span className="category-progress-text">
              ✓ {correctCount}/{totalCount}
            </span>
          </div>
          {showReset && (
            <button
              className="btn-reset-section"
              onClick={(e) => { e.stopPropagation(); onReset(); }}
            >
              進捗をリセット
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// 大カテゴリのアコーディオン。見出しタップで開閉、右端の全選択/全解除で一括選択。
// 畳んだ状態でも問題数・進捗・選択数が見えるようにする
function MajorGroup({
  majorLabel, sections, getSectionProblems, results, session, onResetResults,
  filterActive, filterLabelText, isProblemIncluded, availableSections,
  checkedSections, toggleSection, toggleGroup, resetSection, resetMajor,
  isOpen, onToggleOpen,
}) {
  const majorAvailable = availableSections(sections);
  const majorAllChecked = majorAvailable.length > 0 && majorAvailable.every(s => checkedSections.has(s));
  const majorProblems = sections.flatMap(getSectionProblems);
  const answeredInMajor = majorProblems.filter(p => results[p.id] !== undefined).length;
  const correctInMajor = majorProblems.filter(p => results[p.id] === true).length;
  const totalInMajor = majorProblems.length;
  const filteredInMajor = filterActive ? majorProblems.filter(isProblemIncluded).length : totalInMajor;

  const headerTap = useTap(onToggleOpen);
  const selectTap = useTap(() => { if (majorAvailable.length > 0) toggleGroup(majorAvailable); });

  return (
    <div className="major-category-group">
      <h3 className="major-category-label">
        <span
          className="major-toggle-area"
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          {...headerTap}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggleOpen()}
        >
          <span className={`major-chevron${isOpen ? ' major-chevron--open' : ''}`}>▶</span>
          <span className="major-label-text">{majorLabel}</span>
          {!isOpen && (
            <span className="major-summary">
              {filterActive
                ? `${filteredInMajor}問（${filterLabelText}）`
                : answeredInMajor > 0
                  ? `✓ ${correctInMajor}/${totalInMajor}`
                  : `${totalInMajor}問`}
            </span>
          )}
        </span>
        <div className="major-category-actions">
          {isOpen && session && onResetResults && answeredInMajor > 0 && (
            <button
              className="btn-reset-major"
              onClick={() => resetMajor(majorLabel, sections)}
            >
              進捗をリセット
            </button>
          )}
          <button
            className={`select-badge${majorAllChecked ? ' select-badge--active' : ''}`}
            {...selectTap}
          >
            {majorAllChecked ? '全解除' : '全選択'}
          </button>
        </div>
      </h3>
      {isOpen && (
        <div className="category-grid">
          {sections.map((cat) => {
            const catProblems = getSectionProblems(cat);
            const totalCount = catProblems.length;
            const filteredCount = filterActive
              ? catProblems.filter(isProblemIncluded).length
              : totalCount;
            const available = filterActive ? filteredCount > 0 : totalCount > 0;
            const answeredCount = catProblems.filter(p => results[p.id] !== undefined).length;
            const correctCount = catProblems.filter(p => results[p.id] === true).length;
            const countText = totalCount === 0
              ? '準備中'
              : filterActive
                ? `${filteredCount}問（${filterLabelText}）`
                : `${totalCount}問`;
            return (
              <CategoryCard
                key={cat}
                label={sectionLabel(cat)}
                available={available}
                isChecked={checkedSections.has(cat)}
                countText={countText}
                answeredCount={answeredCount}
                correctCount={correctCount}
                totalCount={totalCount}
                showReset={!!(session && onResetResults && answeredCount > 0)}
                onToggle={() => toggleSection(cat)}
                onReset={() => resetSection(cat, catProblems)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CategoryList({ categories, problems, randomMode, onToggleRandom, unansweredOnlyMode, onToggleUnansweredOnly, wrongOnlyMode, onToggleWrongOnly, onStart, results = {}, session, onResetResults, onStartChinitsu }) {
  const books = groupByBook(categories);
  // section → 問題配列。render のたびに全問題を何度も filter しないための索引
  const problemsBySection = useMemo(() => {
    const map = new Map();
    for (const p of problems) {
      const list = map.get(p.section);
      if (list) list.push(p);
      else map.set(p.section, [p]);
    }
    return map;
  }, [problems]);
  const getSectionProblems = (cat) => problemsBySection.get(cat) ?? [];
  const [checkedSections, setCheckedSections] = useState(new Set());
  // 選択中の書籍タブ。リロードしても保持する（保存済みの書籍が存在しなければ先頭へ）
  const [activeBook, setActiveBook] = useState(() => {
    const stored = localStorage.getItem('activeBook');
    if (stored && books.some(b => b.label === stored)) return stored;
    return books[0]?.label ?? '';
  });

  function selectBook(label) {
    setActiveBook(label);
    localStorage.setItem('activeBook', label);
  }
  // 出題数。null = 全問（選択カテゴリが変わっても常に全問に追従する）
  const [questionCount, setQuestionCount] = useState(null);
  // 開いている大カテゴリ（"書籍::大カテゴリ" キーの集合）。初回は全部畳む
  const [openMajors, setOpenMajors] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('openMajorCategories') ?? '[]'));
    } catch {
      return new Set();
    }
  });

  function toggleMajorOpen(key) {
    setOpenMajors(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem('openMajorCategories', JSON.stringify([...next]));
      return next;
    });
  }

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
      const catProblems = getSectionProblems(cat);
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
    if (!window.confirm(`「${sectionLabel(cat)}」の進捗をリセットしますか？`)) return;
    onResetResults(catProblems.map(p => p.id));
  }

  function resetMajor(majorLabel, sections) {
    if (!window.confirm(`「${majorLabel}」の進捗をリセットしますか？`)) return;
    onResetResults(sections.flatMap(getSectionProblems).map(p => p.id));
  }

  function resetBook(bookLabel) {
    if (!window.confirm(`「${bookLabel}」全体の進捗をリセットしますか？`)) return;
    const bookData = books.find(b => b.label === bookLabel);
    if (!bookData) return;
    const ids = bookData.majorGroups
      .flatMap(g => g.sections)
      .flatMap(getSectionProblems)
      .map(p => p.id);
    onResetResults(ids);
  }

  return (
    <div className="category-list">

      {session && (
        <div className="toggle-rows">
          <ToggleRow label="シャッフル出題" checked={randomMode} onToggle={onToggleRandom} />
          <ToggleRow label="未回答のみ" checked={unansweredOnlyMode} onToggle={onToggleUnansweredOnly} />
          <ToggleRow label="間違いのみ" checked={wrongOnlyMode} onToggle={onToggleWrongOnly} />
        </div>
      )}

      <div className="book-tabs">
        {onStartChinitsu && (
          <button className="book-tab" onClick={onStartChinitsu}>
            清一色 何切る道場
          </button>
        )}
        {books.map(({ label: bookLabel, majorGroups }) => {
          const bookSections = majorGroups.flatMap(g => g.sections);
          const selectedCount = bookSections.filter(s => checkedSections.has(s)).length;
          return (
            <button
              key={bookLabel}
              className={`book-tab${activeBook === bookLabel ? ' book-tab--active' : ''}`}
              onClick={() => selectBook(bookLabel)}
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
              .flatMap(getSectionProblems);
            const answeredInBook = bookProblems.filter(p => results[p.id] !== undefined).length;
            return answeredInBook > 0 ? (
              <div className="book-reset-bar">
                <button className="btn-reset-book" onClick={() => resetBook(activeBook)}>
                  「{activeBook}」の進捗をリセット
                </button>
              </div>
            ) : null;
          })()}

          {activeBookData.majorGroups.map(({ label: majorLabel, sections }) => {
            const majorKey = `${activeBook}::${majorLabel}`;
            return (
              <MajorGroup
                key={majorKey}
                majorLabel={majorLabel}
                sections={sections}
                getSectionProblems={getSectionProblems}
                results={results}
                session={session}
                onResetResults={onResetResults}
                filterActive={filterActive}
                filterLabelText={filterLabel()}
                isProblemIncluded={isProblemIncluded}
                availableSections={availableSections}
                checkedSections={checkedSections}
                toggleSection={toggleSection}
                toggleGroup={toggleGroup}
                resetSection={resetSection}
                resetMajor={resetMajor}
                isOpen={openMajors.has(majorKey)}
                onToggleOpen={() => toggleMajorOpen(majorKey)}
              />
            );
          })}
        </div>
      )}

      {checkedSections.size > 0 && (() => {
        const effectiveCount = questionCount === null
          ? totalSelectedProblems
          : Math.min(questionCount, totalSelectedProblems);
        const trackPct = totalSelectedProblems > 1
          ? ((effectiveCount - 1) / (totalSelectedProblems - 1)) * 100
          : 100;
        return (
          <div className="start-button-bar">
            {totalSelectedProblems > 1 && (
              <div className="question-count-row">
                <span className="question-count-label">出題数</span>
                <input
                  type="range"
                  className="question-count-slider"
                  min={1}
                  max={totalSelectedProblems}
                  value={effectiveCount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setQuestionCount(v >= totalSelectedProblems ? null : v);
                  }}
                  aria-label="出題数"
                  style={{ '--track-fill': `linear-gradient(to right, var(--color-primary) ${trackPct}%, var(--color-border-strong) ${trackPct}%)` }}
                />
                <span className="question-count-value">
                  {questionCount === null ? `全問（${totalSelectedProblems}）` : `${effectiveCount}問`}
                </span>
              </div>
            )}
            <button
              className="btn-start"
              onClick={() => onStart(checkedSections, effectiveCount)}
              disabled={totalSelectedProblems === 0}
            >
              出題開始（{effectiveCount}問）
            </button>
          </div>
        );
      })()}
    </div>
  );
}
