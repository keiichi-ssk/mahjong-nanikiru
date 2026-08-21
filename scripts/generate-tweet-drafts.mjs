// X投稿の下書きを自動生成するスクリプト。
// メンチン何切るドリルの判定エンジン（chinitsuUtils.js）で手牌をランダム生成し、
// 「最善手も次善手もテンパイに取れて待ちが2種類以上ある」問題だけを採って、
// そのままコピペで使える投稿文＋シェアURLを出力する。自動投稿はしない（下書きのみ）。
// 受け入れの広さで優劣は付けない（条件を満たせば広くても狭くても採用する）。
// 手牌は文字表記だけだと分かりにくいため、実際の牌画像を並べたHTMLプレビューも生成しブラウザで開く。
// あわせて**ツイートに添付するカード画像（/api/og のPNG）も落として保存する**（理由は fetchCardImage のコメント）。
// 実行: npm run tweet-drafts [件数（省略時5）]

import { register } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

// src/utils配下はViteの流儀で拡張子なしimportのため、Nodeから読めるようローダーを登録してから動的importする
register('./esm-resolve-js-loader.mjs', import.meta.url);

const { generateChinitsuHand, analyzeDiscard, isWinningHand, computeBestDiscards } = await import('../src/utils/chinitsuUtils.js');
const { buildShareUrl, handToNotation, encodeHandParam } = await import('../src/utils/chinitsuShare.js');
const { getTileImageUrl, sortTiles } = await import('../src/utils/tileUtils.js');
const { SITE_URL } = await import('../src/config/site.js');

const SAMPLE_SIZE = 20000;
const SUITS = ['m', 'p', 's'];
const OUT_DIR = path.resolve('scripts/tweet-drafts-out');
const TILES_DIR = path.resolve('public/tiles');
// 待ちの種類数の下限。単騎・カンチャン・ペンチャン＝1／両面・シャンポン＝2／多面待ち＝3以上なので、
// 2 にすると両面・シャンポンまで通り、1種類待ちだけが落ちる
const MIN_WAIT_KINDS = 2;

// クイズ投稿の「答え」を組み立てる。
// 本文に「答えはリンク先で解くと分かります」を入れた（2026-08-08）ため、これは
// **投稿前に自分で答えを確かめるためのもの**で、リプは任意になった（付け忘れても導線は切れない）。
// 判定エンジン(computeBestDiscards/analyzeDiscard)で最善打牌と待ちを算出し、麻雀表記に変換する。
// 全最善打牌の待ちが同じなら1行にまとめ、異なれば打牌ごとに列挙する（待ちの合算をしない）。
function buildAnswerText(hand) {
  const { maxUkeire, bestTiles, analysisByTile } = computeBestDiscards(hand);
  const lines = sortTiles(bestTiles).map(tile => {
    const waits = sortTiles(analysisByTile.get(tile).waits);
    return { tile, waitsText: handToNotation(waits), kinds: waits.length };
  });
  const allSame = lines.every(l => l.waitsText === lines[0].waitsText);

  let body;
  if (allSame) {
    const tilesText = handToNotation(sortTiles(bestTiles));
    body = `${tilesText}切り → ${lines[0].waitsText} の${lines[0].kinds}面待ち（${maxUkeire}枚）`;
  } else {
    body = lines.map(l => `${handToNotation([l.tile])}切り → ${l.waitsText}（${l.kinds}面）`).join('\n')
      + `\n各${maxUkeire}枚`;
  }
  // 答えにはURLを含めない（リプするとき、本文ツイートと同じOGPカードが二重表示されるのを
  // 避けるため。同じツリーなので試せる導線は本文ツイート側のカード＆リンクから辿れる）
  return `【答え】\n${body}`;
}

// プレビューHTMLに埋め込むテキストの最低限のエスケープ
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 同じ受け入れ枚数の中で役の高いものだけに絞る（アプリの正誤判定と同じ絞り込み）
function topValueOf(tier) {
  const maxValue = Math.max(...tier.map(r => r.value));
  return tier.filter(r => r.value === maxValue);
}

// 採用条件: 「最善手」「次善手」の受け入れ枚数（2段階）がともに
// MIN_WAIT_KINDS 種類以上の待ちになる手牌のみを対象にする。
// 条件を満たすかどうかだけを見て、受け入れの広さで優劣は付けない
function judgeHand(hand) {
  if (isWinningHand(hand)) return null; // 既にアガリの形は「何切る」問題として成立しないため除外

  const candidates = [...new Set(hand)];
  const results = candidates
    .map(tile => ({ tile, ...analyzeDiscard(hand, tile) }))
    .filter(r => r.isTenpai);
  if (results.length === 0) return null;

  const ukeireLevels = [...new Set(results.map(r => r.ukeire))].sort((a, b) => b - a);
  if (ukeireLevels.length < 2) return null; // 次善手（2番目に受け入れが広い打牌）が存在しない

  const bestTier = topValueOf(results.filter(r => r.ukeire === ukeireLevels[0]));
  const secondTier = topValueOf(results.filter(r => r.ukeire === ukeireLevels[1]));
  const hasEnoughWaits = (tier) => tier.every(r => r.waits.length >= MIN_WAIT_KINDS);
  if (!hasEnoughWaits(bestTier) || !hasEnoughWaits(secondTier)) return null;

  // maxUkeire / waitKinds はプレビューの見出しに出すためだけに返す（採否の順位付けには使わない）
  return { hand, maxUkeire: ukeireLevels[0], waitKinds: new Set(bestTier.flatMap(r => r.waits)).size };
}

// 手牌の形（スーツを無視した数字構成）が同じものは1件に絞り、似た問題が並ぶのを防ぐ
function shapeKey(hand) {
  return hand.map(t => t[0]).sort().join('');
}

// 手牌はランダム生成なので、条件を満たしたものを出た順に採るだけで無作為抽出になる。
// 受け入れの広さで並べ替えないので全部を作る必要はなく、必要な数が揃った時点で打ち切る
// （SAMPLE_SIZE は条件を満たす手牌が出ないときに止めるための上限）
function pickCandidates(count) {
  const seen = new Set();
  const picked = [];
  for (let i = 0; i < SAMPLE_SIZE && picked.length < count; i++) {
    const suit = SUITS[i % SUITS.length];
    const judged = judgeHand(generateChinitsuHand(suit));
    if (!judged) continue;
    const key = shapeKey(judged.hand);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(judged);
  }
  return picked;
}

function tileImgTag(tile) {
  const fileName = path.basename(getTileImageUrl(tile));
  const svg = readFileSync(path.join(TILES_DIR, fileName));
  const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  return `<span class="tile"><img src="${uri}" alt="${tile}" /></span>`;
}

// 添付画像のブロック。取得に失敗していたら、その旨と再取得用のURLを出す（下書き自体は使えるため）
function cardBlockHtml(card) {
  if (!card.ok) {
    return `
      <div class="block">
        <div class="block-label">② 添付画像</div>
        <p class="card-error">画像を取得できませんでした（${escapeHtml(card.detail)}）。
        次のURLをブラウザで開いて手動で保存してください:<br />
        <a class="card-link" href="${card.imageUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.imageUrl)}</a></p>
      </div>`;
  }
  return `
      <div class="block">
        <div class="block-label">② 添付画像（これをツイートに添付する）</div>
        <img class="card-preview" src="${card.relPath}" alt="OGPカード" />
        <div class="btn-row">
          <a class="open-btn" href="${card.relPath}" download="${card.fileName}">画像を保存</a>
          <span class="card-path">${escapeHtml(card.absPath)}</span>
        </div>
      </div>`;
}

function draftHtml(d, i, tweetText, answerText, intentUrl, card) {
  return `
    <section class="card">
      <h2>候補${i + 1}　受け入れ${d.maxUkeire}枚・${d.waitKinds}面待ち</h2>
      <div class="tiles">${d.hand.map(tileImgTag).join('')}</div>
      <div class="block">
        <div class="block-label">① 本文（クイズ）</div>
        <pre class="tweet-text">${escapeHtml(tweetText)}</pre>
        <div class="btn-row">
          <button class="copy-btn" onclick="copyPre(this)">本文をコピー</button>
          <a class="open-btn" href="${intentUrl}" target="_blank" rel="noopener noreferrer">X投稿画面を開く</a>
        </div>
      </div>
${cardBlockHtml(card)}
      <div class="block">
        <div class="block-label">③ 答え（自分の確認用・必要ならリプ）</div>
        <pre class="tweet-text">${escapeHtml(answerText)}</pre>
        <div class="btn-row">
          <button class="copy-btn" onclick="copyPre(this)">答えをコピー</button>
        </div>
      </div>
    </section>`;
}

// 手牌のOGPカード画像（/api/og が返すPNG）を落としてローカルに保存する。
//
// 【なぜ画像を保存するのか（2026-08-22〜）】
// 以前は X のリンクカードに画像を出させる方式だったが、**予約投稿だと投稿の瞬間にカード画像が
// 出ない事故が起きた**（2026-08-15〜19の投稿。後から自然に表示されたものもあれば、画像なしの
// 小さいカードのまま固まったものもある）。原因はサーバー側ではなく X 側で、/api/og はその手牌の
// カードを初回アクセス時にその場で生成するため約2秒かかり、X のクローラーが待ちきれずに諦めていた。
// 先にキャッシュを温める対策も入れていたが、①温めてから投稿までに数日空くとキャッシュが消える
// ②Vercelのエッジキャッシュはリージョンごとで、日本から温めても米国のクローラーには効かない、
// の2点で確実性が足りなかった。
// そこで**画像をツイートに直接添付する運用に変更した**。添付画像は X のサーバーへ直接アップロード
// されるので、クロールもタイムアウトも介在しない。
// ※ アプリ内の「この問題をXでシェア」ボタン（buildShareUrl）は従来どおりカード方式のままなので、
//    /api/share と /api/og は消さないこと。
//
// ネットワークが無くても下書き自体は使えるよう、失敗しても処理は止めない。
async function fetchCardImage(hand, filePath) {
  const imageUrl = `${SITE_URL}/api/og?q=${encodeHandParam(hand)}`;
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { imageUrl, ok: false, detail: `カード画像が ${res.status}` };
    writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
    return { imageUrl, ok: true };
  } catch (e) {
    return { imageUrl, ok: false, detail: e.message };
  }
}

function previewPageHtml(cardsHtml) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>Xシェア下書きプレビュー</title><style>
  body {
    margin: 0; padding: 24px;
    background: #2e3440; color: #eceff4;
    font-family: "Yu Gothic UI", "Meiryo", sans-serif;
  }
  h1 { font-size: 1.3rem; margin-bottom: 20px; }
  .card {
    background: #3b4252; border: 1px solid #4c566a; border-radius: 12px;
    padding: 18px 20px; margin-bottom: 22px;
  }
  .card h2 { margin: 0 0 12px; font-size: 1rem; color: #88c0d0; }
  .tiles { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 14px; }
  .tile {
    display: flex; align-items: center; justify-content: center;
    width: 40px; height: 55px;
    background: linear-gradient(160deg, #ffffff 0%, #f0efec 100%);
    border: 2px solid #b8c0cc; border-radius: 6px;
  }
  .tile img { width: 34px; height: 49px; object-fit: contain; }
  .block { margin-bottom: 14px; }
  .block-label { font-size: 0.8rem; color: #9fadbf; margin-bottom: 6px; }
  .tweet-text {
    white-space: pre-wrap; font-family: inherit; font-size: 0.95rem;
    background: #2e3440; border-radius: 8px; padding: 12px 14px; margin: 0 0 8px;
  }
  .btn-row { display: flex; gap: 10px; align-items: center; }
  .copy-btn {
    padding: 8px 16px; background: #4c566a; color: #eceff4;
    border: none; border-radius: 8px; font-weight: bold; font-size: 0.9rem; cursor: pointer;
  }
  .copy-btn:hover { background: #5a657c; }
  .open-btn {
    display: inline-block; padding: 8px 16px; background: #5e81ac; color: #eceff4;
    border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 0.9rem;
  }
  .card-preview {
    display: block; width: 100%; max-width: 480px; height: auto;
    border-radius: 8px; margin-bottom: 8px;
  }
  .card-path { font-size: 0.75rem; color: #9fadbf; word-break: break-all; }
  .card-error { margin: 0; font-size: 0.85rem; color: #ebcb8b; }
  .card-link { color: #88c0d0; }
  .howto {
    background: #3b4252; border-left: 4px solid #88c0d0; border-radius: 6px;
    padding: 12px 16px; margin-bottom: 20px; font-size: 0.9rem; line-height: 1.7;
  }
  .howto ol { margin: 6px 0 0; padding-left: 1.2em; }
</style></head>
<body>
  <h1>Xシェア下書きプレビュー</h1>
  <div class="howto">
    <strong>投稿手順（画像添付方式・2026-08-22〜）</strong>
    <ol>
      <li>「本文をコピー」で本文＋リンクをコピーし、Xの投稿（予約）画面に貼る</li>
      <li>「画像を保存」でカード画像を保存し、同じ投稿に<strong>添付する</strong></li>
      <li>そのまま投稿するか、予約日時を設定する</li>
    </ol>
    画像を添付するとXのリンクカードは出ませんが、そのぶん画像が確実に・大きく表示されます
    （カード方式は予約投稿だと画像が出ないことがあったため切り替えました）。
  </div>
  ${cardsHtml}
  <script>
    function copyPre(btn) {
      const pre = btn.closest('.block').querySelector('pre');
      navigator.clipboard.writeText(pre.textContent).then(() => {
        const old = btn.textContent;
        btn.textContent = 'コピーしました';
        setTimeout(() => { btn.textContent = old; }, 1200);
      });
    }
  </script>
</body></html>`;
}

const count = Number(process.argv[2]) || 5;
const drafts = pickCandidates(count);

// 過去のプレビューを上書きしないよう、生成時刻をファイル名に付ける（preview-2026-07-24_15-30-12.html）
const stamp = new Date().toLocaleString('sv-SE').replace(' ', '_').replace(/:/g, '-');
const cardsDirName = `cards-${stamp}`;
const cardsDir = path.join(OUT_DIR, cardsDirName);
mkdirSync(cardsDir, { recursive: true });

// 添付用のカード画像を先に落とす（プレビューHTMLに埋め込むため、HTMLの組み立てより前に行う）
console.log('添付用のカード画像を取得しています…');
const cardResults = await Promise.all(drafts.map((d, i) => {
  const fileName = `${i + 1}-${encodeHandParam(d.hand)}.png`;
  const filePath = path.join(cardsDir, fileName);
  return fetchCardImage(d.hand, filePath).then(r => ({
    ...r,
    fileName,
    absPath: filePath,
    // プレビューHTMLは OUT_DIR 直下にあるので、そこからの相対パスで参照する
    relPath: `${cardsDirName}/${fileName}`,
  }));
}));

const cards = drafts.map((d, i) => {
  // 本文（クイズ）は buildShareUrl が組み立てたものをそのまま流用する（文言の二重管理を避けるため）。
  // ただし**リンク先URLだけは下書き側で差し替える**: 画像添付方式ではカードを出さないので、
  // カード用の中継ページ（/api/share）を経由する必要がなく、生のリンクとして本文に見えるぶん
  // 遊べるページを直接指したほうが自然でリダイレクトも1回減る。
  // アプリ内のシェアボタン（buildShareUrl）は従来どおり /api/share のままにしてある。
  const pageUrl = `${SITE_URL}/chinitsu.html?q=${encodeHandParam(d.hand)}`;
  const text = new URL(buildShareUrl(d.hand)).searchParams.get('text');
  // Xが text の後ろに url を付けるのと同じ並びにしてあるので、投稿画面から投稿しても手コピーでも結果は同じ
  const tweetText = `${text}\n${pageUrl}`;
  // 「X投稿画面を開く」リンクも同じ直リンクに揃える（本文コピーと食い違わないように）
  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`;
  // 答え（投稿前の確認用。リプするかは任意）はこのスクリプトで生成する
  const answerText = buildAnswerText(d.hand);
  return draftHtml(d, i, tweetText, answerText, intentUrl, cardResults[i]);
});

const outPath = path.join(OUT_DIR, `preview-${stamp}.html`);
writeFileSync(outPath, previewPageHtml(cards.join('\n')));

const failed = cardResults.filter(r => !r.ok);
if (failed.length === 0) {
  console.log(`✓ ${cardResults.length}件のカード画像を保存しました: ${cardsDir}`);
} else {
  console.log(`△ ${cardResults.length - failed.length}/${cardResults.length}件のカード画像を保存しました。次の画像は取得できていません:`);
  for (const f of failed) console.log(`  - ${f.imageUrl}（${f.detail}）`);
  console.log('  プレビューに再取得用のURLを載せてあります（本番URLへ接続できているか確認してください）。');
}

console.log(`${drafts.length}件の下書きを生成しました。プレビューをブラウザで開きます: ${outPath}`);
if (process.platform === 'win32') {
  exec(`start "" "${outPath}"`);
}
