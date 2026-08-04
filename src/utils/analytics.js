// GA4（gtag）へのイベント送信。**送信口はこのファイルだけにすること**。
//
// ★ Supabase に依存しないので chinitsu.jsx 側から呼んでもよい
//   （あの画面の「Supabase を import しない」制約を壊さない）。
// ★ gtag が入っていないページ（admin.html）や広告ブロッカーの環境でも落ちないよう、
//   必ず存在チェックを通してから呼ぶ。計測のために画面を壊さないこと。

// 送っているイベントの一覧。名前を直書きせず必ずここを通すこと
// （タイポすると GA4 側で別イベントとして貯まり、気づかないまま数字が欠ける）。
//
// ⚠ GA4 はカスタムパラメータ（mode / correct / score / source）を管理画面の
//   「カスタム定義」に登録しないとレポートに出ない。パラメータを増やしたときは
//   docs/dev-analytics.md の登録手順も更新すること。
export const EVENTS = {
  drillStart: 'drill_start',                   // mode: 'timeattack' | 'practice' | 'review'
  drillAnswer: 'drill_answer',                 // mode, correct: true | false
  drillFinish: 'drill_finish',                 // score: 正解数
  problemSaved: 'problem_saved',               // kind: 'edit' | 'paifu' | 'restored'（保存に成功したときだけ）
  problemShared: 'problem_shared',             // source: shareSource() の戻り値
  sharedProblemOpened: 'shared_problem_opened', // ok: true|false（false は壊れたリンク）, via: 'token'|'param'
};

/**
 * GA4 にイベントを1件送る。送れたら true、gtag が無ければ false（呼び出し側は無視してよい）。
 */
export function track(name, params = {}) {
  if (typeof window === 'undefined') return false;
  const gtag = window.gtag;
  if (typeof gtag !== 'function') return false;
  gtag('event', name, params);
  return true;
}

/**
 * 共有ボタンがどの画面から押されたかを URL から判定する。
 * ShareButton は用途を知らない作りなので、呼び出し側に prop を足して回らずに済ませている
 * （＝共有ボタンを新しく足しても自動で計測される）。
 */
export function shareSource(pathname) {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  if (path.includes('myproblems')) return 'myproblems';
  if (path.includes('chinitsu')) return 'chinitsu';
  if (path.includes('admin')) return 'admin';
  return 'app';
}
