const MAJOR_CATEGORIES = [
  { label: 'テンパイの技術',    min: 1,  max: 3  },
  { label: '1シャンテンの技術', min: 4,  max: 11 },
  { label: '2シャンテンの技術', min: 12, max: 16 },
  { label: '3シャンテンの技術', min: 17, max: 17 },
  { label: '鳴きの技術',        min: 18, max: 24 },
];

export function sectionNumber(section) {
  return parseInt(section.match(/^(\d+)_/)?.[1] ?? '0', 10);
}

export function sectionLabel(section) {
  return section.replace(/^\d+_/, '');
}

export function getMajorCategory(section) {
  const n = sectionNumber(section);
  return MAJOR_CATEGORIES.find(({ min, max }) => n >= min && n <= max)?.label ?? 'その他';
}

export function groupByMajorCategory(categories) {
  const groups = [];
  for (const { label } of MAJOR_CATEGORIES) {
    const sections = categories.filter((c) => getMajorCategory(c) === label);
    if (sections.length > 0) groups.push({ label, sections });
  }
  return groups;
}
