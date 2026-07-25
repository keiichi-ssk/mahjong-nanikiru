// デイリーランキングのフロント側 fetch ラッパー。
// Supabase は import せず、自サイトの /api/leaderboard（Vercel関数）だけを叩く
// （公開ページの「Supabase非import・環境変数不要」の原則を守るため）。
// 判定・整形などの純粋ロジックは leaderboardUtils.js 側に置く（ここは通信のみ）。

// 今日（JST）のランキング上位を取得する。失敗時は例外を投げる。
// 返り値は { id, name, score, created_at } の配列（score 降順）。
export async function fetchTodayRanking() {
  const res = await fetch('/api/leaderboard', { method: 'GET' });
  if (!res.ok) throw new Error(`ranking fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.entries) ? data.entries : [];
}

// スコアを登録する。name は任意（null/空でも可＝匿名）。
// website は honeypot（人間は常に空。bot が埋めてきたらサーバー側で捨てられる）。
// 返り値は { ok, id }（id は登録行のID。ランキング内で自分をハイライトするのに使う）。
export async function submitScore({ name, score, website }) {
  const res = await fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score, website }),
  });
  if (!res.ok) throw new Error(`score submit failed: ${res.status}`);
  return res.json();
}
