// 共有された自作問題を「共有トークン」から1件だけ取り出す共通処理。
// api/shared-problem.js（本体）・api/share-q.js（中継ページ）・api/og-problem.js（カード画像）が使う。
//
// ★★ このファイルはサーバー専用。src/ 側から import しないこと ★★
//   サービスロールキーを使うので、ブラウザに渡るコードに混ぜると鍵が漏れる。
//   `_lib` に置いているのは、Vercel が **アンダースコア始まりをエンドポイントとして公開しない**ため。
//
// なぜ RLS ではなくサービスロールキーなのか:
//   やりたいのは「トークンを知っている人だけがその1問を読める」。これを RLS で書くと
//   「共有中なら anon も読める」という形になり、**条件を工夫すれば共有中の問題を列挙できてしまう**。
//   RLS は「この行を読んでよいか」しか判定できず、リクエストの中身に応じた制御が苦手なので、
//   user_problems の RLS は閉じたまま、ここで「トークン一致の1行・必要な列だけ」を返している。

import { fromUserDb } from '../../src/utils/userProblemMapper.js';

// share_token は uuid。形式を確かめてから問い合わせる（不正な文字列でDBを叩かない）
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 共有相手に渡す列。**user_id を含めないこと**（誰が作ったかは渡さない）。
// ⚠ 列を足すときは user_problems に実在することを確認する。存在しない列名を書くと
//   PostgREST が 400 を返し、共有ページが丸ごと開けなくなる
const COLUMNS = [
  'id', 'title', 'display_no', 'category_id',
  'tiles', 'answer', 'dora', 'riichi', 'explanation', 'disabled', 'melds',
  'problem_type', 'discarded_tile', 'naki_choices', 'question_image_url',
  'bakaze', 'kyoku', 'honba', 'jikaze', 'junme', 'note', 'other_discard', 'scores',
].join(',');

export function isShareToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/**
 * トークンに対応する問題を取りに行き、{ problem, reason } を返す。
 *
 * reason は失敗した理由（成功時は null）。**api/ はローカルで動かせないので、
 * 本番で切り分けるにはこれしか手がかりがない**。値そのものは漏らさず、
 * どの段階で止まったかだけを返す:
 *   invalid-token  … トークンの形式が uuid ではない
 *   not-configured … 環境変数（VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）が未設定
 *   upstream-4xx   … Supabase が拒否した（列名の誤り・鍵が無効など）
 *   no-row         … 接続はできたが、そのトークンの行が無い
 */
export async function fetchSharedProblemResult(token) {
  if (!isShareToken(token)) return { problem: null, reason: 'invalid-token' };

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // 環境変数が未設定でも 500 で落とさない（呼び出し側が「見つからない」として扱える）
  if (!url || !key) return { problem: null, reason: 'not-configured' };

  let rows;
  try {
    const res = await fetch(
      `${url}/rest/v1/user_problems?share_token=eq.${token}&select=${COLUMNS}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return { problem: null, reason: `upstream-${res.status}` };
    rows = await res.json();
  } catch {
    return { problem: null, reason: 'fetch-failed' };
  }

  if (!Array.isArray(rows) || rows.length === 0) return { problem: null, reason: 'no-row' };
  return { problem: fromUserDb(rows[0]), reason: null };
}

/** 問題だけが欲しい呼び出し向け（中継ページ・カード画像）。無ければ null。 */
export async function fetchSharedProblem(token) {
  return (await fetchSharedProblemResult(token)).problem;
}
