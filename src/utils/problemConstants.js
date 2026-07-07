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
// 暗槓は両端が裏向き、それ以外は1枚目（鳴いた牌）を横向きにする
export function getMeldTileRole(type, index) {
  if (type === 'ankan') return (index === 0 || index === 3) ? 'back' : 'normal';
  return index === 0 ? 'rotated' : 'normal';
}
