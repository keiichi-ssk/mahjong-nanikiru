// メンチン何切るの「操作の例」の画像を、実際の練習画面から撮って作るスクリプト。
// 見本の手牌（src/utils/chinitsuExample.js）を共有URL（?q=）で開き、判定エンジンが出す
// 正解の打牌と待ちを実際にクリックで選んでから、回答部分（① 切る牌 〜「回答する」）だけを撮る。
// ライトとダークの2枚を撮る（ルールのダイアログが表示中のテーマに合わせて出し分ける）。
//
// 実行: 開発サーバーを起動した状態で
//   npm run dev                                   （別のターミナルで）
//   node scripts/capture-chinitsu-example.mjs [開発サーバーのURL（省略時 http://localhost:5173）]
// 出力: public/ 配下の CHINITSU_EXAMPLE_IMAGES のパス。撮り直すときはファイル名の数字を上げてから実行する

import { register } from 'node:module';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

// src/utils配下はViteの流儀で拡張子なしimportのため、Nodeから読めるようローダーを登録してから動的importする
register('./esm-resolve-js-loader.mjs', import.meta.url);

const { CHINITSU_EXAMPLE_HAND, CHINITSU_EXAMPLE_IMAGES } = await import('../src/utils/chinitsuExample.js');
const { computeBestDiscards } = await import('../src/utils/chinitsuUtils.js');
const { encodeHandParam } = await import('../src/utils/chinitsuShare.js');
const { THEME_STORAGE_KEY } = await import('../src/utils/theme.js');

const baseUrl = process.argv[2] ?? 'http://localhost:5173';

const { bestTiles, analysisByTile } = computeBestDiscards(CHINITSU_EXAMPLE_HAND);
const discard = bestTiles[0];
const waits = analysisByTile.get(discard).waits;

const browser = await chromium.launch();

for (const [theme, imagePath] of Object.entries(CHINITSU_EXAMPLE_IMAGES)) {
  const outFile = path.resolve('public', imagePath.replace(/^\//, ''));
  // スマホ幅で撮る（見本は狭い列に置くので、横長のPC画面より縦に詰まった配置の方が読みやすい）。
  // 等倍だと高解像度の画面でぼやけるので2倍で撮る
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  // テーマは保存された設定として先に入れておく（各HTMLの先読みスクリプトが最初から反映する）
  await context.addInitScript(([key, value]) => {
    try { localStorage.setItem(key, value); } catch { /* 保存できない環境は無い前提 */ }
  }, [THEME_STORAGE_KEY, theme]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/chinitsu.html?q=${encodeHandParam(CHINITSU_EXAMPLE_HAND)}`, { waitUntil: 'networkidle' });

  // 練習モードは入ったときにルールのダイアログが自動で開くので、閉じてから操作する
  await page.click('.chinitsu-rules-start-btn');

  // 出題画面の直下の要素に絞る（ルールのダイアログ等の中にある同名の要素を拾わないように）
  const handRow = await page.$('.problem-view > .tile-selector-row > .tile-selector');
  const waitRow = await page.$('.problem-view > .tile-selector');
  const handButtons = await handRow.$$('.tile-button');
  await handButtons[CHINITSU_EXAMPLE_HAND.indexOf(discard)].click();
  const waitButtons = await waitRow.$$('.tile-button');
  for (const w of waits) await waitButtons[Number(w[0]) - 1].click();
  // 最後にクリックした牌にマウスのホバー表示が残らないよう、画面外へ逃がす
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);

  // 「① 切る牌」の見出しから「回答する」ボタンまでを切り出す
  const top = await page.$eval('.problem-view > .chinitsu-step', el => el.getBoundingClientRect().top + window.scrollY);
  const bottom = await page.$eval('.problem-view > .naki-choice-submit-btn', el => el.getBoundingClientRect().bottom + window.scrollY);
  mkdirSync(path.dirname(outFile), { recursive: true });
  await page.screenshot({
    path: outFile,
    clip: { x: 0, y: Math.max(0, top - 12), width: 390, height: bottom - top + 24 },
  });
  await context.close();
  console.log(`保存しました（${theme}）: ${outFile}`);
}

await browser.close();
console.log(`見本: ${discard[0]}を切って ${waits.map(w => w[0]).join('・')} 待ち`);
