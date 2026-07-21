// ご意見・ご要望の受け口（Vercel サーバーレス関数）。
// フロントからは fetch('/api/feedback', { method: 'POST' }) で呼ぶ。
// Supabase への書き込みは Vercel に設定済みの環境変数（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）
// を使い、REST API 経由で anon ロールとして INSERT する。
// ※ サービスロールキーが使えるようになったら、こちらに差し替えて RLS の anon INSERT 許可を
//    撤廃するとスパム耐性を強化できる（Vercel ダッシュボードで環境変数を追加できることが前提）。

const MAX_MESSAGE_LENGTH = 500;
const ALLOWED_SOURCES = new Set(['app', 'chinitsu']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { message, source, website } = req.body ?? {};

  // honeypot: 画面には出さない隠しフィールド。bot が埋めてきたら成功を装って捨てる
  if (website) {
    return res.status(200).json({ ok: true });
  }

  if (typeof message !== 'string' || message.trim().length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'invalid message' });
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: 'server not configured' });
  }

  const upstream = await fetch(`${url}/rest/v1/feedback`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      message: message.trim(),
      source: typeof source === 'string' && ALLOWED_SOURCES.has(source) ? source : null,
    }),
  });

  if (!upstream.ok) {
    return res.status(502).json({ error: 'upstream error' });
  }
  return res.status(200).json({ ok: true });
}
