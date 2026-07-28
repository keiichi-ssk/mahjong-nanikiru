import { describe, it, expect } from 'vitest';
import {
  MELD_FROMS, DEFAULT_MELD_FROM, canMeldHaveFrom, getMeldFromOptions,
  normalizeMeld, normalizeMelds, getMeldTileRole, windAt, relativeWind,
  PROBLEM_TYPE_LABELS,
} from './problemConstants';
import { normalizeProblemType } from './judgeUtils';

// 副露の各牌の表示形態を並びで受け取る（'normal' | 'rotated' | 'back'）
function roles(type, count, from) {
  return Array.from({ length: count }, (_, i) => getMeldTileRole(type, i, from));
}

describe('副露の鳴いた元（from）', () => {
  it('選択肢は上家・対面・下家の3つ（自分は含まない）', () => {
    expect(MELD_FROMS).toEqual(['上家', '対面', '下家']);
    expect(DEFAULT_MELD_FROM).toBe('上家');
  });

  it('暗槓だけが鳴いた元を持てない', () => {
    expect(canMeldHaveFrom('chi')).toBe(true);
    expect(canMeldHaveFrom('pon')).toBe(true);
    expect(canMeldHaveFrom('kan')).toBe(true);
    expect(canMeldHaveFrom('kakan')).toBe(true);
    expect(canMeldHaveFrom('ankan')).toBe(false);
  });

  it('from が無ければ上家を補完する', () => {
    expect(normalizeMeld({ type: 'pon', tiles: ['1z', '1z', '1z'] }).from).toBe('上家');
  });

  it('チーは上家からしか鳴けない', () => {
    expect(getMeldFromOptions('chi')).toEqual(['上家']);
    expect(getMeldFromOptions('pon')).toEqual(MELD_FROMS);
    expect(getMeldFromOptions('ankan')).toEqual([]);
  });

  it('チーに上家以外が入っていても上家に矯正される', () => {
    expect(normalizeMeld({ type: 'chi', tiles: ['3m', '4m', '5m'], from: '下家' }).from).toBe('上家');
  });

  it('暗槓の from は常に null（値が入っていても消す）', () => {
    expect(normalizeMeld({ type: 'ankan', tiles: ['5p', '5p', '5p', '5p'] }).from).toBeNull();
    expect(normalizeMeld({ type: 'ankan', tiles: ['5p', '5p', '5p', '5p'], from: '下家' }).from).toBeNull();
  });

  it('選べる値が入っている場合は変更しない', () => {
    expect(normalizeMeld({ type: 'pon', tiles: ['1z', '1z', '1z'], from: '対面' }).from).toBe('対面');
  });

  it('normalizeMelds は配列以外を空配列にする', () => {
    expect(normalizeMelds(undefined)).toEqual([]);
    expect(normalizeMelds(null)).toEqual([]);
    expect(normalizeMelds([])).toEqual([]);
  });
});

describe('getMeldTileRole（横向きの牌の位置は鳴いた元で決まる）', () => {
  it('上家からは左端が横向き', () => {
    expect(roles('pon', 3, '上家')).toEqual(['rotated', 'normal', 'normal']);
  });

  it('対面からは真ん中が横向き', () => {
    expect(roles('pon', 3, '対面')).toEqual(['normal', 'rotated', 'normal']);
  });

  it('下家からは右端が横向き', () => {
    expect(roles('pon', 3, '下家')).toEqual(['normal', 'normal', 'rotated']);
  });

  it('4枚（大明槓）の対面は左寄りの中央、下家は右端', () => {
    expect(roles('kan', 4, '対面')).toEqual(['normal', 'rotated', 'normal', 'normal']);
    expect(roles('kan', 4, '下家')).toEqual(['normal', 'normal', 'normal', 'rotated']);
  });

  it('暗槓は鳴いた元に関わらず両端が裏向き（横向きは無し）', () => {
    expect(roles('ankan', 4, '下家')).toEqual(['back', 'normal', 'normal', 'back']);
  });

  it('from を渡さない呼び出しは従来どおり左端が横向き', () => {
    expect(roles('pon', 3, undefined)).toEqual(['rotated', 'normal', 'normal']);
  });
});

// 席は東→南→西→北→東の順に「下家」方向へ進む
describe('windAt（ある家から見た相対位置の風）', () => {
  it('東から見た各家', () => {
    expect(windAt('東', '下家')).toBe('南');
    expect(windAt('東', '対面')).toBe('西');
    expect(windAt('東', '上家')).toBe('北');
  });

  it('北から見た各家（一周して戻る）', () => {
    expect(windAt('北', '下家')).toBe('東');
    expect(windAt('北', '対面')).toBe('南');
    expect(windAt('北', '上家')).toBe('西');
  });

  it('不正な値は null', () => {
    expect(windAt('中', '上家')).toBeNull();
    expect(windAt('東', '自分')).toBeNull();
    expect(windAt(null, '上家')).toBeNull();
  });
});

describe('relativeWind（ある家から見て相手がどの位置か）', () => {
  it('windAt の逆変換になっている', () => {
    for (const base of ['東', '南', '西', '北']) {
      for (const rel of MELD_FROMS) {
        expect(relativeWind(base, windAt(base, rel))).toBe(rel);
      }
    }
  });

  it('同じ風なら null（自分自身は相対位置を持たない）', () => {
    expect(relativeWind('南', '南')).toBeNull();
  });

  it('不正な値は null', () => {
    expect(relativeWind('東', '白')).toBeNull();
    expect(relativeWind(null, '南')).toBeNull();
  });
});

// 問題タイプのラベルは管理画面のセレクタと自作問題の一覧が共有する対応表。
// 文言や選択肢を変えたらこのテストも更新すること（片方だけ直す事故を防ぐ）
describe('PROBLEM_TYPE_LABELS', () => {
  it('問題タイプとラベルの対応（ゴールデン）', () => {
    expect(PROBLEM_TYPE_LABELS).toEqual({
      'default':         '通常（何切る）',
      'riichi-judgment': 'リーチ判断',
      'naki-timing':     '鳴きタイミング',
      'naki-choice':     '鳴き選択',
      'betaori':         'ベタオリ',
    });
  });

  it('normalizeProblemType が返す値はすべてラベルを持つ', () => {
    // 廃止された image-quiz や未知の値も default に寄るので、必ずラベルが引ける
    for (const input of ['default', 'riichi-judgment', 'naki-timing', 'naki-choice', 'betaori', 'image-quiz', undefined]) {
      expect(PROBLEM_TYPE_LABELS[normalizeProblemType(input)]).toBeTruthy();
    }
  });
});
