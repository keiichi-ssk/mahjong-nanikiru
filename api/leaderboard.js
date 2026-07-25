// メンチン何切る タイムアタックのデイリーランキングの受け口（Vercel サーバーレス関数）。
// フロントからは fetch('/api/leaderboard') で呼ぶ（GET=今日のランキング取得 / POST=スコア登録）。
// Supabase への読み書きは Vercel の環境変数（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）を使い、
// REST API 経由で anon ロールとして行う。ご意見・ご要望（api/feedback.js）と同じ構成。
//
// ※ 認証なしのため、正規の画面を通さず直接この API を叩けばスコアは詐称できる（設計上の割り切り）。
//    score 上限（sanitizeScore）と honeypot でカジュアルな不正だけ緩和し、
//    悪質なエントリは Supabase ダッシュボードから手動削除（DELETE はスーパー管理者のみ許可）する運用。
//
// api/ 配下の import は Vercel のバンドラー都合で拡張子を明示する（src/utils/* の慣例とは異なる）。
import { jstDayStartISO, sanitizeScore, sanitizeName } from '../src/utils/leaderboardUtils.js';

// 今日のランキングで返す最大件数
const RANKING_LIMIT = 30;

export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: 'server not configured' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, url, key);
  }
  if (req.method === 'POST') {
    return handlePost(req, res, url, key);
  }
  return res.status(405).json({ error: 'method not allowed' });
}

// 今日（JST）のスコアを score 降順・登録が早い順で上位 RANKING_LIMIT 件返す
async function handleGet(req, res, url, key) {
  const start = jstDayStartISO();
  const query =
    `select=id,name,score,created_at` +
    `&created_at=gte.${encodeURIComponent(start)}` +
    `&order=score.desc,created_at.asc` +
    `&limit=${RANKING_LIMIT}`;

  const upstream = await fetch(`${url}/rest/v1/leaderboard?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!upstream.ok) {
    return res.status(502).json({ error: 'upstream error' });
  }
  const entries = await upstream.json();
  return res.status(200).json({ entries });
}

// スコアを1件登録する。honeypot・score 検証を通ったものだけ INSERT し、
// 挿入した行の id を返す（フロントが自分のエントリをランキング内でハイライトするのに使う）。
async function handlePost(req, res, url, key) {
  const { name, score, website } = req.body ?? {};

  // honeypot: 画面には出さない隠しフィールド。bot が埋めてきたら成功を装って捨てる
  if (website) {
    return res.status(200).json({ ok: true, id: null });
  }

  const cleanScore = sanitizeScore(score);
  if (cleanScore === null) {
    return res.status(400).json({ error: 'invalid score' });
  }
  const cleanName = sanitizeName(name); // null=匿名

  const upstream = await fetch(`${url}/rest/v1/leaderboard`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name: cleanName, score: cleanScore }),
  });

  if (!upstream.ok) {
    return res.status(502).json({ error: 'upstream error' });
  }
  const rows = await upstream.json();
  const id = Array.isArray(rows) && rows[0] ? rows[0].id : null;
  return res.status(200).json({ ok: true, id });
}
