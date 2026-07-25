// サイトの公開URL（オリジン）の唯一の定義。
// シェアリンク・OGP の URL 組み立てはすべてここを参照する（値を直接書かないこと）。
//
// 【ドメインを変更するときの手順】
// このファイルの SITE_URL を変えるだけでは足りない。以下の静的ファイルは JS から参照できないため、
// 必ずセットで書き換えること:
//   - chinitsu.html     … og:url / og:image / link rel=canonical
//   - index.html        … og:url / og:image / link rel=canonical
//   - public/robots.txt … Sitemap 行
//   - public/sitemap.xml … 各 <loc>
//   - vercel.json       … 旧ドメインからのリダイレクト先（destination）
// なお api/og.js はリクエストの origin から組み立てるためドメイン非依存（変更不要）。
export const SITE_URL = 'https://zagakumahjong.com';
