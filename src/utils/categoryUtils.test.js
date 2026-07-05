import { describe, it, expect } from 'vitest';
import {
  BOOKS,
  ALL_MAJOR_CATEGORIES,
  sectionNumber,
  sectionLabel,
  getBookLabel,
  getMajorCategory,
  getMajorCategoryKey,
  majorCategoryKey,
  getSituationText,
  isSectionAllowed,
  groupByBook,
} from './categoryUtils';
import categoriesData from '../data/categories.json';

// 現行の書籍・大カテゴリマッピングのゴールデンテーブル。
// リファクタ（ID範囲判定→categories.jsonのbook/major明示）の前後で
// このマッピングが変わらないことを保証する。
const GOLDEN_RANGES = [
  { book: '現代麻雀技術論', major: 'テンパイの技術',        min: 1,  max: 3  },
  { book: '現代麻雀技術論', major: '1シャンテンの技術',     min: 4,  max: 11 },
  { book: '現代麻雀技術論', major: '2シャンテンの技術',     min: 12, max: 16 },
  { book: '現代麻雀技術論', major: '3シャンテン以上の選択', min: 17, max: 17 },
  { book: '現代麻雀技術論', major: '鳴きの技術',            min: 18, max: 24 },
  { book: '新科学する麻雀実践編', major: 'テンパイの技術',   min: 25, max: 29 },
  { book: '新科学する麻雀実践編', major: '対リーチ押し引き', min: 30, max: 36 },
  { book: '新科学する麻雀実践編', major: '対副露押し引き',   min: 37, max: 44 },
  { book: '新科学する麻雀実践編', major: 'ベタオリの技術',   min: 45, max: 46 },
];

describe('getBookLabel / getMajorCategory: 全46件のゴールデン突合', () => {
  for (const { book, major, min, max } of GOLDEN_RANGES) {
    it(`${min}〜${max} は ${book} / ${major}`, () => {
      for (let id = min; id <= max; id++) {
        expect(getBookLabel(String(id))).toBe(book);
        expect(getMajorCategory(String(id))).toBe(major);
      }
    });
  }

  it('範囲外は「その他」', () => {
    expect(getBookLabel('0')).toBe('その他');
    expect(getBookLabel('47')).toBe('その他');
    expect(getBookLabel('99')).toBe('その他');
    expect(getMajorCategory('0')).toBe('その他');
    expect(getMajorCategory('47')).toBe('その他');
  });
});

describe('レガシー section 互換', () => {
  it('「1_リーチ判断」形式は parseInt でカテゴリ1に解決される', () => {
    expect(sectionNumber('1_リーチ判断')).toBe(1);
    expect(getBookLabel('1_リーチ判断')).toBe(getBookLabel('1'));
    expect(getMajorCategory('1_リーチ判断')).toBe(getMajorCategory('1'));
  });
});

describe('sectionLabel', () => {
  it('カテゴリIDからタイトルを引く', () => {
    expect(sectionLabel('1')).toBe('リーチ判断');
    expect(sectionLabel('24')).toBe('鳴きを考慮した手作り字牌編');
    expect(sectionLabel('25')).toBe('第1章');
    expect(sectionLabel('46')).toBe('第22章');
  });

  it('未知のIDは文字列のまま返す', () => {
    expect(sectionLabel('99')).toBe('99');
  });
});

describe('getSituationText', () => {
  it('1〜11 は「東場 南家 7〜9巡目」', () => {
    expect(getSituationText('1')).toBe('東場 南家 7〜9巡目');
    expect(getSituationText('11')).toBe('東場 南家 7〜9巡目');
  });

  it('12〜17 は「東場 南家 4〜6巡目」', () => {
    expect(getSituationText('12')).toBe('東場 南家 4〜6巡目');
    expect(getSituationText('17')).toBe('東場 南家 4〜6巡目');
  });

  it('18以降は null', () => {
    expect(getSituationText('18')).toBeNull();
    expect(getSituationText('25')).toBeNull();
    expect(getSituationText('46')).toBeNull();
  });
});

describe('groupByBook: CategoryList 互換の戻り値形状', () => {
  it('{label, majorGroups:[{label, sections}]} の形で、sections は入力値をそのまま含む', () => {
    const result = groupByBook(['1', '5', '25']);

    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('現代麻雀技術論');
    expect(result[1].label).toBe('新科学する麻雀実践編');

    expect(result[0].majorGroups).toEqual([
      { label: 'テンパイの技術', sections: ['1'] },
      { label: '1シャンテンの技術', sections: ['5'] },
    ]);
    expect(result[1].majorGroups).toEqual([
      { label: 'テンパイの技術', sections: ['25'] },
    ]);
  });

  it('該当カテゴリの無い大カテゴリは majorGroups から除去される', () => {
    const result = groupByBook(['18']);
    expect(result[0].majorGroups).toEqual([
      { label: '鳴きの技術', sections: ['18'] },
    ]);
    expect(result[1].majorGroups).toEqual([]);
  });

  it('大カテゴリの並びは定義順を保つ', () => {
    const result = groupByBook(['46', '30', '25']);
    expect(result[1].majorGroups.map(g => g.label)).toEqual([
      'テンパイの技術',
      '対リーチ押し引き',
      'ベタオリの技術',
    ]);
  });
});

describe('majorCategoryKey / getMajorCategoryKey: 複合キー', () => {
  it('書籍またぎの同名大カテゴリを区別できる', () => {
    expect(getMajorCategoryKey('1')).toBe('現代麻雀技術論::テンパイの技術');
    expect(getMajorCategoryKey('25')).toBe('新科学する麻雀実践編::テンパイの技術');
    expect(getMajorCategoryKey('1')).not.toBe(getMajorCategoryKey('25'));
  });

  it('未知のsectionは null', () => {
    expect(getMajorCategoryKey('99')).toBeNull();
  });

  it('majorCategoryKey は "書籍::大カテゴリ" 形式', () => {
    expect(majorCategoryKey('現代麻雀技術論', '鳴きの技術')).toBe('現代麻雀技術論::鳴きの技術');
  });
});

describe('isSectionAllowed: 権限判定', () => {
  it('null/undefined は無制限（常に許可）', () => {
    expect(isSectionAllowed(null, '1')).toBe(true);
    expect(isSectionAllowed(undefined, '46')).toBe(true);
  });

  it('空配列は全拒否', () => {
    expect(isSectionAllowed([], '1')).toBe(false);
  });

  it('複合キーは該当書籍の大カテゴリだけを許可する', () => {
    const allowed = ['現代麻雀技術論::テンパイの技術'];
    expect(isSectionAllowed(allowed, '1')).toBe(true);
    expect(isSectionAllowed(allowed, '3')).toBe(true);
    expect(isSectionAllowed(allowed, '4')).toBe(false);
    expect(isSectionAllowed(allowed, '25')).toBe(false); // 同名でも別書籍は不許可
  });

  it('レガシー裸ラベルは両書籍の同名大カテゴリにマッチする（現行挙動の保存）', () => {
    const allowed = ['テンパイの技術'];
    expect(isSectionAllowed(allowed, '1')).toBe(true);
    expect(isSectionAllowed(allowed, '25')).toBe(true);
    expect(isSectionAllowed(allowed, '4')).toBe(false);
  });

  it('レガシー裸ラベル（片書籍にのみ存在）', () => {
    const allowed = ['鳴きの技術'];
    expect(isSectionAllowed(allowed, '18')).toBe(true);
    expect(isSectionAllowed(allowed, '25')).toBe(false);
  });

  it('複合キーとレガシーの混在配列', () => {
    const allowed = ['新科学する麻雀実践編::ベタオリの技術', '鳴きの技術'];
    expect(isSectionAllowed(allowed, '45')).toBe(true);
    expect(isSectionAllowed(allowed, '18')).toBe(true);
    expect(isSectionAllowed(allowed, '1')).toBe(false);
  });

  it('未知の旧ラベル（基本戦略など）は何も許可しない', () => {
    expect(isSectionAllowed(['基本戦略'], '1')).toBe(false);
    expect(isSectionAllowed(['基本戦略'], '25')).toBe(false);
  });

  it('未知のsectionは常に不許可', () => {
    expect(isSectionAllowed(['現代麻雀技術論::テンパイの技術'], '99')).toBe(false);
  });
});

describe('BOOKS: categories.json からの導出', () => {
  it('書籍2冊が定義順に並ぶ', () => {
    expect(BOOKS.map(b => b.label)).toEqual(['現代麻雀技術論', '新科学する麻雀実践編']);
  });

  it('大カテゴリのラベルと並びが現行と一致する', () => {
    expect(BOOKS[0].majorCategories.map(m => m.label)).toEqual([
      'テンパイの技術',
      '1シャンテンの技術',
      '2シャンテンの技術',
      '3シャンテン以上の選択',
      '鳴きの技術',
    ]);
    expect(BOOKS[1].majorCategories.map(m => m.label)).toEqual([
      'テンパイの技術',
      '対リーチ押し引き',
      '対副露押し引き',
      'ベタオリの技術',
    ]);
  });

  it('categoryIds がゴールデンの範囲と一致する', () => {
    const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const allMajors = BOOKS.flatMap(b =>
      b.majorCategories.map(m => ({ book: b.label, major: m.label, categoryIds: m.categoryIds }))
    );
    expect(allMajors).toEqual(
      GOLDEN_RANGES.map(({ book, major, min, max }) => ({ book, major, categoryIds: range(min, max) }))
    );
  });

  it('ALL_MAJOR_CATEGORIES は全9大カテゴリの複合キーを持つ', () => {
    expect(ALL_MAJOR_CATEGORIES).toHaveLength(9);
    expect(ALL_MAJOR_CATEGORIES.map(c => c.key)).toContain('現代麻雀技術論::テンパイの技術');
    expect(ALL_MAJOR_CATEGORIES.map(c => c.key)).toContain('新科学する麻雀実践編::テンパイの技術');
    // キーに重複が無い
    expect(new Set(ALL_MAJOR_CATEGORIES.map(c => c.key)).size).toBe(9);
  });
});

describe('categories.json の整合性', () => {
  it('全件が id / book / major / title を持つ', () => {
    for (const c of categoriesData) {
      expect(typeof c.id).toBe('number');
      expect(typeof c.book).toBe('string');
      expect(c.book.length).toBeGreaterThan(0);
      expect(typeof c.major).toBe('string');
      expect(c.major.length).toBeGreaterThan(0);
      expect(typeof c.title).toBe('string');
      expect(c.title.length).toBeGreaterThan(0);
    }
  });

  it('id に重複が無い', () => {
    const ids = categoriesData.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('book / major / title に権限キーの区切り文字 :: を含まない', () => {
    for (const c of categoriesData) {
      expect(c.book).not.toContain('::');
      expect(c.major).not.toContain('::');
    }
  });
});
