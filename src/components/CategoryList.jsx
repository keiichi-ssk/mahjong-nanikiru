import { useState, useMemo } from 'react';
import { groupByBook, sectionLabel, USER_BOOK_LABEL } from '../utils/categoryUtils';
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
  isOpen, onToggleOpen, userCategories,
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
                label={sectionLabel(cat, userCategories)}
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

export default function CategoryList({ categories, problems, randomMode, onToggleRandom, unansweredOnlyMode, onToggleUnansweredOnly, wrongOnlyMode, onToggleWrongOnly, onStart, results = {}, session, onResetResults, userCategories = [], canUseMyProblems = false, officialLocked = false }) {
  // 自作問題（section が u: で始まる）は categories.json に無いので、
  // groupByBook に user_categories を渡して「my問題集(β)」書籍としてまとめてもらう。
  // 作成画面への入口はこのタブの中にあるので、使える人には1問も無くてもタブを出す
  const allBooks = groupByBook(categories, userCategories, { alwaysUser: canUseMyProblems });
  // 公式問題の閲覧許可が無いユーザーには、中身が空の書籍タブを並べても意味が無いので落とす。
  // 許可ユーザーの従来挙動（大カテゴリ制限で空になった書籍タブ＋「非公開のコンテンツです」）は変えない
  const books = officialLocked
    ? allBooks.filter(b => b.majorGroups.length > 0 || b.label === USER_BOOK_LABEL)
    : allBooks;
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
  // 未ログイン時の「非公開のコンテンツ」タブが選択されているか（選択時のみ下に文言を出す）
  const [lockedTabSelected, setLockedTabSelected] = useState(false);
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
    if (!window.confirm(`「${sectionLabel(cat, userCategories)}」の進捗をリセットしますか？`)) return;
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
        {/* ドリルの実体は公開ページ（/chinitsu.html）に一本化してある。本体側はリンクを置くだけ。
            別タブで開くのは、本体（ログイン状態と problems の全件取得）を読み込み直させないため。 */}
        <a className="book-tab" href="/chinitsu.html" target="_blank" rel="noopener">
          メンチン何切るドリル
        </a>
        {session ? (
          books.map(({ label: bookLabel, majorGroups }) => {
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
          })
        ) : (
          // 未ログイン時は書籍名を出さない（限定公開コンテンツのタイトルを隠す）
          <button
            className={`book-tab book-tab--locked${lockedTabSelected ? ' book-tab--active' : ''}`}
            onClick={() => setLockedTabSelected(v => !v)}
          >
            非公開のコンテンツ
          </button>
        )}
      </div>

      {!session && lockedTabSelected && (
        <div className="pending-notice">非公開のコンテンツです</div>
      )}

      {/* 公式問題を見られないユーザーへの案内。行き止まりにせず、使えるものを伝える */}
      {officialLocked && (
        <p className="limited-notice">
          一部のコンテンツは限定公開です。<br />
          自分で作る「my問題集(β)」と「メンチン何切るドリル」はご利用いただけます。
        </p>
      )}

      {/* my問題集(β)は0件でもタブを出すので、ここの「非公開」からは除く（中身は下の空状態が出す） */}
      {session && activeBookData && activeBookData.majorGroups.length === 0
        && activeBookData.label !== USER_BOOK_LABEL && (
        <div className="pending-notice">非公開のコンテンツです</div>
      )}

      {activeBookData && (activeBookData.majorGroups.length > 0
        || activeBookData.label === USER_BOOK_LABEL) && (
        <div key={activeBook} className="book-content">
          {/* 自作問題の作成・編集は専用ページ。別タブで開く（本体の読み込み直しを避けるため）。
              1問も無いときはこのボタンだけが出る（作成画面への入口を絶やさないため） */}
          {activeBookData.label === USER_BOOK_LABEL && (
            <div className="my-problems-bar">
              <a className="my-problems-link" href="/myproblems.html" target="_blank" rel="noopener">
                ＋ 問題を作る・編集する
              </a>
              {/* 作成画面は盤面と編集パネルの2カラムでPC前提。開いてから気づくと手間なので先に伝える */}
              <p className="my-problems-empty">作成画面はPC専用です（解くのはスマートフォンでもできます）</p>
              {activeBookData.majorGroups.length === 0 && (
                <p className="my-problems-empty">
                  まだ問題がありません。作成画面で自分だけの問題集を作れます。
                </p>
              )}
            </div>
          )}

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
                userCategories={userCategories}
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
