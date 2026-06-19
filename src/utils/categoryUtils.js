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
];

export function sectionNumber(section) {
  return parseInt(section.match(/^(\d+)_/)?.[1] ?? '0', 10);
}

export function sectionLabel(section) {
  return section.replace(/^\d+_/, '');
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
  }).filter(({ majorGroups }) => majorGroups.length > 0);
}
