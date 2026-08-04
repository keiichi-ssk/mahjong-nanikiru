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

// JWT に入っているロール名だけを取り出す（診断用。鍵の値そのものは扱わない）。
// service_role なら RLS も GRANT も素通しになるので、403 が返るときは anon を掴んでいる疑いが濃い。
// ★ atob を使うのは Edge Runtime（og-problem.js）でも動かすため。Buffer はあちらに無い
function jwtRole(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload))?.role ?? 'norole';
  } catch {
    return 'unparsable';
  }
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

  // ★ 空白の除去は必須。Vercel の環境変数に値を貼り付けると改行や空白が混ざることがあり
  //   （折り返し表示されたキーを手で選択コピーすると途中に改行が入る）、
  //   そのままヘッダに渡すと fetch が「不正なヘッダ値」で例外を投げる。
  //   URL も JWT も空白を含まない値なので、全部落としてしまって構わない。
  const url = (process.env.VITE_SUPABASE_URL ?? '').replace(/\s+/g, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/\s+/g, '');
  // 環境変数が未設定でも 500 で落とさない（呼び出し側が「見つからない」として扱える）
  if (!url || !key) return { problem: null, reason: 'not-configured' };
  if (!/^https:\/\/\S+$/.test(url)) return { problem: null, reason: 'bad-url' };

  // ★ Supabase の鍵には2つの形式があり、送り方が違う（2026-08-04）:
  //   従来の JWT（eyJ…の3部構成 / service_role・anon）
  //     … apikey と Authorization: Bearer の両方に入れる
  //   新しい API キー（sb_secret_… / sb_publishable_…）
  //     … apikey だけ。**JWT ではないので Bearer に入れると PostgREST が解釈できず 401 になる**
  const isJwt = /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key);
  // ★ User-Agent は必ず名乗ること。新しい secret key は **User-Agent がブラウザに見えると
  //   401 を返す**（鍵がブラウザに漏れて使われるのを防ぐ Supabase 側の仕様）
  const headers = { apikey: key, 'User-Agent': 'zagakumahjong-server' };
  if (isJwt) headers.Authorization = `Bearer ${key}`;

  let rows;
  try {
    const res = await fetch(
      `${url}/rest/v1/user_problems?share_token=eq.${token}&select=${COLUMNS}&limit=1`,
      { headers },
    );
    if (!res.ok) {
      // 鍵の「種類」だけを添える。JWT ならロール名まで出す（値は決して載せない）
      const kind = isJwt ? `jwt-${jwtRole(key)}` : 'apikey';
      // PostgreSQL のエラーコードだけ拾う（42501 = permission denied ＝ GRANT 不足）
      if (res.status === 403) {
        const code = await res.json().then(b => b?.code ?? 'nocode').catch(() => 'nobody');
        return { problem: null, reason: `upstream-403-${kind}-${code}` };
      }
      // 401 のときだけ、同じ URL に anon キー（既に設定済みの別の鍵）で投げてみて切り分ける。
      //   anon が通る   → URL は正しい ＝ secret キーの値の問題
      //   anon も落ちる → URL かプロジェクトの取り違え
      if (res.status === 401) {
        const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').replace(/\s+/g, '');
        if (anon) {
          const probe = await fetch(`${url}/rest/v1/user_problems?select=id&limit=1`, {
            headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'User-Agent': 'zagakumahjong-server' },
          }).catch(() => null);
          return { problem: null, reason: `upstream-401-${kind}-anonprobe-${probe?.status ?? 'failed'}` };
        }
      }
      return { problem: null, reason: `upstream-${res.status}-${kind}` };
    }
    rows = await res.json();
  } catch (e) {
    // 例外の種類だけ返す（message には URL が入りうるので載せない）
    return { problem: null, reason: `fetch-failed-${e?.name ?? 'unknown'}` };
  }

  if (!Array.isArray(rows) || rows.length === 0) return { problem: null, reason: 'no-row' };
  return { problem: fromUserDb(rows[0]), reason: null };
}

/** 問題だけが欲しい呼び出し向け（中継ページ・カード画像）。無ければ null。 */
export async function fetchSharedProblem(token) {
  return (await fetchSharedProblemResult(token)).problem;
}
