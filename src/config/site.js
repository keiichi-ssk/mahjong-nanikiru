// サイトの公開URL（オリジン）の唯一の定義。
// シェアリンク・OGP の URL 組み立てはすべてここを参照する（値を直接書かないこと）。
//
// 【ドメインを変更するときの手順】
// このファイルの SITE_URL を変えるだけでは足りない。以下の静的ファイルは JS から参照できないため、
// 必ずセットで書き換えること:
//   - chinitsu.html    … og:url / og:image
//   - index.html       … og:url / og:image
//   - public/robots.txt … Sitemap 行
//   - public/sitemap.xml … 各 <loc>
// なお api/og.js はリクエストの origin から組み立てるためドメイン非依存（変更不要）。
export const SITE_URL = 'https://zagakumahjong.com';

// 旧ドメイン（Vercelアカウントにログインできず停止できないため、リダイレクトで無害化している）。
// 実際の転送は vercel.json の redirects（host 条件付き）がサーバー側で行う。
export const LEGACY_SITE_HOST = 'zagaku-mahjong.vercel.app';
