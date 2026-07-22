// Xのシェアリンクが実際に指す先（/api/share?q=牌14桁+スーツ）。
// クローラー（Twitter等）はJSを実行せずHTMLをそのまま読むため、ここでは手牌に応じた
// og:image/og:url を差し込んだHTMLを返す。人間のブラウザは meta refresh + JS で
// 即座に本来の遊べるページ（/chinitsu.html?q=...）へ遷移する（見た目上は一瞬で切り替わる）。
//
// q は decodeHandParam で検証したうえで encodeHandParam により再構築してから埋め込む
// （元の文字列をそのままHTMLに差し込まない。不正なqでも壊れたHTMLにならないようにするため）。

import { decodeHandParam, encodeHandParam } from '../src/utils/chinitsuShare.js';

const SITE_URL = 'https://zagaku-mahjong.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const hand = decodeHandParam(req.query.q);
  const safeQ = hand ? encodeHandParam(hand) : null;
  const targetUrl = safeQ ? `${SITE_URL}/chinitsu.html?q=${safeQ}` : `${SITE_URL}/chinitsu.html`;
  const imageUrl = safeQ ? `${SITE_URL}/api/og?q=${safeQ}` : `${SITE_URL}/ogp.png`;

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta http-equiv="refresh" content="0; url=${targetUrl}" />
<title>メンチン何切るドリル</title>
<meta property="og:title" content="メンチン何切るドリル" />
<meta property="og:description" content="メンチン（清一色）の何切るをトレーニング。間違えた問題を復習可能。登録不要・スマホ対応。" />
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
