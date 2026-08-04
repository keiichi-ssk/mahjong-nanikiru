// api/ から Supabase の REST API を叩くための共通処理。
//
// ★★ サーバー専用。src/ 側から import しないこと ★★
//   サービスロールキーを使うので、ブラウザに渡るコードに混ぜると鍵が漏れる。
//   `_lib` に置いているのは Vercel が **アンダースコア始まりを公開しない**ため。
//
// ここに集約しているのは、2026-08-04 に本番で連続して踏んだ落とし穴を1箇所で防ぐため:
//   1. 環境変数に貼り付けた値へ改行・空白が混ざる → ヘッダ構築で fetch が例外を投げる
//      （URL も JWT も空白を含まないので、全部落としてよい）
//   2. 新しい API キー（sb_secret_…）は **JWT ではない**ので Authorization: Bearer に
//      入れると PostgREST が解釈できず 401 になる → apikey だけで送る
//   3. 新しい secret key は **User-Agent がブラウザに見えると 401**（鍵の漏洩対策）
//      → サーバーからの呼び出しであることを名乗る
//
// ⚠ テーブルを新しく触るときは service_role への GRANT を忘れないこと。
//   GRANT が無いと RLS と違って「0件の正常応答」ではなく **403** が返る。

/**
 * 接続先とヘッダを組み立てる。設定が無い・壊れているときは null。
 */
export function supabaseTarget() {
  const url = (process.env.VITE_SUPABASE_URL ?? '').replace(/\s+/g, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/\s+/g, '');
  if (!url || !key || !/^https:\/\/\S+$/.test(url)) return null;

  const isJwt = /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key);
  const headers = { apikey: key, 'User-Agent': 'zagakumahjong-server' };
  if (isJwt) headers.Authorization = `Bearer ${key}`;

  return { url, headers };
}

/**
 * Supabase を叩いて { status, body } を返す。通信自体に失敗したら status: 0。
 * path は '/rest/v1/...' から始める。
 */
export async function sbFetch(path, init = {}) {
  const target = supabaseTarget();
  if (!target) return { status: -1, body: null };   // -1 = 設定不足

  try {
    const res = await fetch(`${target.url}${path}`, {
      ...init,
      headers: { ...target.headers, ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };   // 0 = 通信に失敗
  }
}

/** { status } から失敗の理由を短い文字列にする（本番で切り分けるための手がかり）。 */
export function describeFailure(status) {
  if (status === -1) return 'not-configured';
  if (status === 0) return 'fetch-failed';
  // 403 は GRANT 不足（RLS で弾かれる場合は 0 件の正常応答になる）
  return `upstream-${status}`;
}
