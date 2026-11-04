// メンチン何切るの「操作の例」に使う手牌と画像（2026-11-04〜）。
// 画像は実際の練習画面のスクリーンショットで、scripts/capture-chinitsu-example.mjs が
// この手牌を開いて「正解の打牌と待ちを選んだ状態」をライト・ダークの両方で撮って作る。
// ★ 手牌を変えたら画像を撮り直すこと。回答画面の見た目や配色を変えたときも撮り直す。
//   撮り直すときは画像のファイル名の数字を上げる（ブラウザ・CDN のキャッシュで古い画像が出続けるため）
export const CHINITSU_EXAMPLE_HAND = ['1p', '1p', '2p', '3p', '4p', '5p', '5p', '6p', '7p', '7p', '8p', '9p', '9p', '9p'];

export const CHINITSU_EXAMPLE_IMAGES = {
  light: '/images/chinitsu-example-2-light.png',
  dark: '/images/chinitsu-example-2-dark.png',
};
