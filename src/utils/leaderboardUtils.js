// メンチン何切る タイムアタックのデイリーランキング用の純粋関数（DOM/DB非依存）。
// api/leaderboard.js（Vercel関数）とフロント両方から使うため、副作用を持たない。
// api/ からも import されるため、他の src/utils と違い拡張子を明示して読み込まれる。

// 90秒間で現実的に到達し得る正答数の上限。これを超える値は「論外な詐称」として弾く
// （認証なしのため詐称自体は完全には防げない。明らかな異常値だけを排除する割り切り）。
// 持ち時間（ChinitsuTimeAttack.jsx の TOTAL_MS）を変えたらこの値も見直すこと。
export const MAX_SCORE = 60;

// ニックネームの最大文字数（DB の CHECK 制約と揃える）
export const MAX_NAME_LENGTH = 20;

// JST（UTC+9）基準での「今日の0時」を UTC の ISO 文字列で返す。
// Supabase の REST クエリ（created_at=gte.<ISO>）に渡して、その日のぶんだけ集計する。
// デイリーランキングの日付境界は日本時間の深夜0時。
export function jstDayStartISO(now = new Date()) {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  // now を JST の壁時計に読み替えてから、その日の年月日を取り出す
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  // JST 0:00:00 の実時刻（UTC）は、その日付の UTC 0時から 9時間戻したもの
  const startUtcMs = Date.UTC(y, m, d, 0, 0, 0) - JST_OFFSET_MS;
  return new Date(startUtcMs).toISOString();
}

// スコアを検証して正規化する。整数かつ 0〜MAX_SCORE のときだけその数値を返し、
// それ以外（数値でない・小数・範囲外）は null（＝不正・登録拒否）を返す。
export function sanitizeScore(raw) {
  // null/undefined/真偽値/空文字は Number() で 0 等に化けるため、先に型で弾く
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_SCORE) return null;
  return n;
}

// ニックネームを正規化する。文字列でなければ、または空白のみなら null（＝匿名）。
// 前後の空白と制御文字を除去し、MAX_NAME_LENGTH で切り詰める。
export function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  // 制御文字（0x00-0x1f・0x7f。改行やタブ等）を空白に潰してから前後を trim する。
  // 正規表現に制御文字リテラルを書くと lint(no-control-regex) に触れるため、文字コードで判定する。
  const cleaned = Array.from(raw)
    .map(ch => {
      const code = ch.charCodeAt(0);
      return code < 0x20 || code === 0x7f ? ' ' : ch;
    })
    .join('')
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

// score 降順に並んだランキングの中で、指定スコアが何位になるかを返す（同点は同順位）。
// entries は { score } を持つ配列で、score 降順ソート済みを前提とする。
export function rankForScore(entries, score) {
  let higher = 0;
  for (const e of entries) {
    if (e.score > score) higher += 1;
    else break;
  }
  return higher + 1;
}
