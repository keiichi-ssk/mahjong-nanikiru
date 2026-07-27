// 出題画面（ProblemView）と管理画面（ProblemEditor）で共有する問題まわりの定数。
// 片方だけ直して食い違う事故を防ぐため、ラベルや選択肢の定義は必ずここに置く。

// 鳴きタイミング問題（naki-timing）の4択
export const NAKI_TIMING_OPTIONS = [
  { value: 'early', label: '序盤から鳴く' },
  { value: 'mid',   label: '中盤から鳴く' },
  { value: 'late',  label: '終盤から鳴く' },
  { value: 'no',    label: '鳴かない' },
];

// 副露の種類と表示ラベル・必要牌数
export const MELD_TYPES = ['chi', 'pon', 'kan', 'kakan', 'ankan'];
export const MELD_TYPE_LABELS = { chi: 'チー', pon: 'ポン', kan: '大明槓', kakan: '加槓', ankan: '暗槓' };
export const MELD_TILE_COUNT  = { chi: 3, pon: 3, kan: 4, kakan: 4, ankan: 4 };

// 副露内の i 枚目の表示形態。
// 暗槓は両端が裏向き、それ以外は鳴いた牌を横向きにする。
// 横向きの位置は鳴いた元で決まる（上家=左端 / 対面=真ん中 / 下家=右端）。
// 4枚（大明槓・加槓）で「真ん中」は中央が2枚あるため左寄り（index 1）に置く。
// from を渡さない呼び出しは従来どおり左端が横向きになる
export function getMeldTileRole(type, index, from) {
  if (type === 'ankan') return (index === 0 || index === 3) ? 'back' : 'normal';
  return index === rotatedMeldIndex(type, from) ? 'rotated' : 'normal';
}

function rotatedMeldIndex(type, from) {
  const count = MELD_TILE_COUNT[type] ?? 3;
  if (from === '下家') return count - 1;
  if (from === '対面') return 1;
  return 0; // 上家（および from 未設定）
}

// 副露の「鳴いた元」。鳴いた家から見た相対位置で持つ（絶対風にしない理由は
// 自風を変えても「上家から鳴いた」という関係が保たれるため）。
// 暗槓は自分で引いた牌なので鳴いた元を持たない（from: null）。
export const MELD_FROMS = ['上家', '対面', '下家'];

// from を持たない旧データは、すべて上家から鳴いたものとみなす（2026-07-27 の移行方針）
export const DEFAULT_MELD_FROM = '上家';

// 鳴いた元を持てる副露か（暗槓だけが持てない）
export function canMeldHaveFrom(type) {
  return type !== 'ankan';
}

// 副露の種類ごとに選べる鳴いた元。チーは上家からしかできない
export function getMeldFromOptions(type) {
  if (!canMeldHaveFrom(type)) return [];
  return type === 'chi' ? ['上家'] : MELD_FROMS;
}

// 副露に from を補完する。読み込み時（problemMapper.fromDb）と
// 管理画面での副露作成時の両方から使う唯一の実装。
// 選べない値（チーの対面/下家、暗槓の鳴いた元）が入っていても正しい値に矯正する
export function normalizeMeld(meld) {
  if (!meld) return meld;
  const options = getMeldFromOptions(meld.type);
  if (options.length === 0) return { ...meld, from: null };
  return { ...meld, from: options.includes(meld.from) ? meld.from : options[0] };
}

export function normalizeMelds(melds) {
  return Array.isArray(melds) ? melds.map(normalizeMeld) : [];
}

// 相対位置（上家/対面/下家）と風（東南西北）の相互変換。
// 席は東→南→西→北→東の順に「下家」方向へ進む
const WIND_ORDER = ['東', '南', '西', '北'];
const FROM_OFFSET = { 下家: 1, 対面: 2, 上家: 3 };

// base（風）から見た relative（上家/対面/下家）の家の風を返す。
// 例: 自風が東で「上家」なら北。base か relative が不正なら null
export function windAt(base, relative) {
  const baseIdx = WIND_ORDER.indexOf(base);
  const offset  = FROM_OFFSET[relative];
  if (baseIdx < 0 || offset === undefined) return null;
  return WIND_ORDER[(baseIdx + offset) % 4];
}

// base（風）から見て target（風）がどの相対位置かを返す。同じ風なら null
export function relativeWind(base, target) {
  const baseIdx   = WIND_ORDER.indexOf(base);
  const targetIdx = WIND_ORDER.indexOf(target);
  if (baseIdx < 0 || targetIdx < 0 || baseIdx === targetIdx) return null;
  const diff = (targetIdx - baseIdx + 4) % 4;
  return Object.keys(FROM_OFFSET).find(k => FROM_OFFSET[k] === diff) ?? null;
}
