import categoriesData from '../data/categories.json';

// categories.json が書籍・大カテゴリ帰属の唯一の情報源。
// 書籍・大カテゴリの表示順は categories.json の配列中の初出順で決まる
// （IDの数値範囲には依存しない。並べ替えると表示順が変わるので注意）。

const CATEGORY_INDEX = Object.fromEntries(categoriesData.map(c => [c.id, c]));

function getCategory(section) {
  return CATEGORY_INDEX[parseInt(section, 10)];
}

function buildBooks(categories) {
  const books = [];
  const bookMap = new Map();
  for (const c of categories) {
    let book = bookMap.get(c.book);
    if (!book) {
      book = { label: c.book, majorCategories: [], majorMap: new Map() };
      bookMap.set(c.book, book);
      books.push(book);
    }
    let major = book.majorMap.get(c.major);
    if (!major) {
      major = { label: c.major, categoryIds: [] };
      book.majorMap.set(c.major, major);
      book.majorCategories.push(major);
    }
    major.categoryIds.push(c.id);
  }
  return books.map(({ label, majorCategories }) => ({ label, majorCategories }));
}

export const BOOKS = buildBooks(categoriesData);

// 権限キーの区切り文字。allowed_users.allowed_major_categories には
// "書籍名::大カテゴリ名" の複合キーを保存する（同名大カテゴリの書籍またぎ対策）
export const MAJOR_KEY_SEPARATOR = '::';

export function majorCategoryKey(bookLabel, majorLabel) {
  return `${bookLabel}${MAJOR_KEY_SEPARATOR}${majorLabel}`;
}

export const ALL_MAJOR_CATEGORIES = BOOKS.flatMap(b =>
  b.majorCategories.map(m => ({
    book: b.label,
    label: m.label,
    key: majorCategoryKey(b.label, m.label),
  }))
);

export function sectionNumber(section) {
  return parseInt(section, 10);
}

export function sectionLabel(section) {
  return getCategory(section)?.title ?? String(section);
}

export function getBookLabel(section) {
  return getCategory(section)?.book ?? 'その他';
}

export function getMajorCategory(section) {
  return getCategory(section)?.major ?? 'その他';
}

export function getMajorCategoryKey(section) {
  const c = getCategory(section);
  return c ? majorCategoryKey(c.book, c.major) : null;
}

export function getSituationText(section) {
  return getCategory(section)?.situation ?? null;
}

// allowed: allowed_users.allowed_major_categories の値。null/undefined は無制限。
// 複合キー（"書籍::大カテゴリ"）に加え、移行前のレガシー裸ラベル（"大カテゴリ"）も受理する
export function isSectionAllowed(allowed, section) {
  if (allowed == null) return true;
  const c = getCategory(section);
  if (!c) return false;
  return allowed.includes(majorCategoryKey(c.book, c.major)) || allowed.includes(c.major);
}

export function groupByBook(categories) {
  return BOOKS.map(({ label: bookLabel, majorCategories }) => {
    const majorGroups = majorCategories
      .map(({ label: majorLabel, categoryIds }) => ({
        label: majorLabel,
        sections: categories.filter((c) => categoryIds.includes(sectionNumber(c))),
      }))
      .filter(({ sections }) => sections.length > 0);
    return { label: bookLabel, majorGroups };
  });
}
