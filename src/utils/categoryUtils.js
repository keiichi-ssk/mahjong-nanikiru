import categoriesData from '../data/categories.json';

// categories.json が書籍・大カテゴリ帰属の唯一の情報源。
// 書籍・大カテゴリの表示順は categories.json の配列中の初出順で決まる
// （IDの数値範囲には依存しない。並べ替えると表示順が変わるので注意）。

const CATEGORY_INDEX = Object.fromEntries(categoriesData.map(c => [c.id, c]));

function getCategory(section) {
  return CATEGORY_INDEX[parseInt(section, 10)];
}

// ===== 自作問題（my問題集）の section =====
// 公式問題の section は categories.json のIDを指す数値文字列。
// 自作問題は user_categories の uuid を使うため、接頭辞で名前空間を分ける。
// これを付けずに uuid をそのまま入れると parseInt が NaN になり、
// groupByBook から漏れて「画面に何も出ない」状態になる（エラーは出ない）。
const USER_SECTION_PREFIX = 'u:';
const UNCATEGORIZED_KEY = 'none';
export const USER_BOOK_LABEL = 'my問題集';

export function isUserSection(section) {
  return typeof section === 'string' && section.startsWith(USER_SECTION_PREFIX);
}

// categoryId が null（未分類）でも section を持たせる（出題対象から漏れないように）
export function userSection(categoryId) {
  return `${USER_SECTION_PREFIX}${categoryId ?? UNCATEGORIZED_KEY}`;
}

// 未分類は null を返す
export function userCategoryId(section) {
  if (!isUserSection(section)) return null;
  const id = section.slice(USER_SECTION_PREFIX.length);
  return id === UNCATEGORIZED_KEY ? null : id;
}

// user_categories の並び順（sort_order で取得済みの配列順）に合わせる。未分類は最後
function sortUserSections(sections, userCategories) {
  const order = new Map((userCategories ?? []).map((c, i) => [c.id, i]));
  return [...sections].sort((a, b) => {
    const ia = userCategoryId(a);
    const ib = userCategoryId(b);
    if (ia === null) return ib === null ? 0 : 1;
    if (ib === null) return -1;
    return (order.get(ia) ?? Infinity) - (order.get(ib) ?? Infinity);
  });
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

// 自作問題の section は categories.json に無いので、user_categories から名前を引く。
// 第2引数はオプショナル（公式問題しか扱わない既存の呼び出しは無変更で動く）
export function sectionLabel(section, userCategories = null) {
  if (isUserSection(section)) {
    const id = userCategoryId(section);
    if (id === null) return '未分類';
    return (userCategories ?? []).find(c => c.id === id)?.name ?? '（削除されたカテゴリ）';
  }
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
  // 自作問題は本人のものなので、大カテゴリ単位の閲覧制限の対象外（常に許可）
  if (isUserSection(section)) return true;
  if (allowed == null) return true;
  const c = getCategory(section);
  if (!c) return false;
  return allowed.includes(majorCategoryKey(c.book, c.major)) || allowed.includes(c.major);
}

// 自作問題の section は categories.json 由来の categoryIds に含まれないため、
// そのままでは全ての majorGroup から漏れて画面に出ない。
// 「my問題集」書籍を末尾に足すことで拾う（userCategories はオプショナル）。
//
// alwaysUser を true にすると、自作問題が1問も無くても空の「my問題集」を作る。
// 作成画面への入口をここに置いているため、0件だとタブごと消えて
// 「まだ1問も作っていない人だけ作成画面へ行けない」状態になるのを防ぐ。
// 既定は false なので、既存の呼び出し（出題順の組み立て等）の挙動は変わらない
export function groupByBook(categories, userCategories = null, { alwaysUser = false } = {}) {
  const books = BOOKS.map(({ label: bookLabel, majorCategories }) => {
    const majorGroups = majorCategories
      .map(({ label: majorLabel, categoryIds }) => ({
        label: majorLabel,
        sections: categories.filter((c) => categoryIds.includes(sectionNumber(c))),
      }))
      .filter(({ sections }) => sections.length > 0);
    return { label: bookLabel, majorGroups };
  });

  const userSections = categories.filter(isUserSection);
  if (userSections.length === 0 && !alwaysUser) return books;

  return [
    ...books,
    {
      label: USER_BOOK_LABEL,
      // 自作問題に大分類は無いので1グループにまとめる。
      // 0件のときは空の majorGroups にする（画面側が「まだ問題がありません」を出す）
      majorGroups: userSections.length === 0
        ? []
        : [{ label: USER_BOOK_LABEL, sections: sortUserSections(userSections, userCategories) }],
    },
  ];
}
