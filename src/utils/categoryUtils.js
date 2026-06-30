import categoriesData from '../data/categories.json';

const CATEGORY_MAP = Object.fromEntries(categoriesData.map(c => [c.id, c.title]));

export const BOOKS = [
  {
    label: '現代麻雀技術論',
    majorCategories: [
      { label: 'テンパイの技術',       min: 1,  max: 3  },
      { label: '1シャンテンの技術',    min: 4,  max: 11 },
      { label: '2シャンテンの技術',    min: 12, max: 16 },
      { label: '3シャンテン以上の選択', min: 17, max: 17 },
      { label: '鳴きの技術',           min: 18, max: 24 },
    ],
  },
  {
    label: '新科学する麻雀',
    majorCategories: [
      { label: '基本戦略',     min: 25, max: 29 },
      { label: '手組みの技術', min: 30, max: 36 },
      { label: '押し引き',     min: 37, max: 43 },
    ],
  },
];

export function sectionNumber(section) {
  return parseInt(section, 10);
}

export function sectionLabel(section) {
  return CATEGORY_MAP[parseInt(section, 10)] ?? String(section);
}

export function getBookLabel(section) {
  const n = sectionNumber(section);
  for (const book of BOOKS) {
    if (book.majorCategories.some(({ min, max }) => n >= min && n <= max)) {
      return book.label;
    }
  }
  return 'その他';
}

export function getMajorCategory(section) {
  const n = sectionNumber(section);
  for (const book of BOOKS) {
    const found = book.majorCategories.find(({ min, max }) => n >= min && n <= max);
    if (found) return found.label;
  }
  return 'その他';
}

export function getSituationText(section) {
  const n = sectionNumber(section);
  if (n >= 1 && n <= 11) return '東場 南家 7〜9巡目';
  if (n >= 12 && n <= 17) return '東場 南家 4〜6巡目';
  return null;
}

export function groupByBook(categories) {
  return BOOKS.map(({ label: bookLabel, majorCategories }) => {
    const majorGroups = majorCategories
      .map(({ label: majorLabel }) => ({
        label: majorLabel,
        sections: categories.filter((c) => getMajorCategory(c) === majorLabel),
      }))
      .filter(({ sections }) => sections.length > 0);
    return { label: bookLabel, majorGroups };
  });
}
