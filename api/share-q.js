// 自作問題のシェアリンクが実際に指す先（/api/share-q?p=圧縮した問題）。
// メンチンドリルの api/share.js とまったく同じ手口:
//   クローラー（Xの展開ボット）はJSを実行しないので、ここで返すHTMLのメタタグを読む。
//   人間のブラウザは meta refresh + JS で即座に share.html（実際に解けるページ）へ移る。
//
// p は base64url の文字だけで構成されるので、そのままHTMLに埋め込んでも
// インジェクションにはならない。それでも正規表現で形式を確かめ、
// さらに decodeProblemParam で「実際に問題として復元できるか」まで見る
// （壊れたリンクなら中継せずトップへ誘導する）。
//
// noindex にしているのは、問題の数だけURLが無限に生える中身の薄い中継ページが
// 大量にインデックスされると本命ページの評価を下げるため（follow は残す）。
// robots.txt の Disallow で塞いではいけない — Twitterbot は robots.txt を尊重するため
// OGP カードが出なくなる。meta の noindex なら Twitterbot は無視して og を読む。

import { decodeProblemParam } from '../src/utils/problemShare.js';
import { SITE_URL } from '../src/config/site.js';

// URL に入る形式（base64url）と、実用上ありえない長さを弾く
const PARAM_PATTERN = /^[A-Za-z0-9\-_]{1,4000}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const raw = typeof req.query.p === 'string' ? req.query.p : '';
  const safeP = PARAM_PATTERN.test(raw) && (await decodeProblemParam(raw)) !== null ? raw : null;

  const targetUrl = safeP ? `${SITE_URL}/share.html?p=${safeP}` : `${SITE_URL}/`;
  const imageUrl  = safeP ? `${SITE_URL}/api/og-problem?p=${safeP}` : `${SITE_URL}/ogp.png`;

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta http-equiv="refresh" content="0; url=${targetUrl}" />
<meta name="robots" content="noindex, follow" />
<title>共有された何切る | 座学する麻雀</title>
<meta property="og:title" content="共有された何切る問題" />
<meta property="og:description" content="麻雀の何切る問題。何を切る？ 登録不要・スマホ対応。" />
<meta property="og:url" content="${targetUrl}" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<script>location.replace(${JSON.stringify(targetUrl)});</script>
</head>
<body>
<p>問題を読み込んでいます…読み込まれない場合は<a href="${targetUrl}">こちら</a>をタップしてください。</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).send(html);
}
