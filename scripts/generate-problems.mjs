#!/usr/bin/env node
/**
 * 麻雀何切る問題 自動生成スクリプト
 *
 * 使い方:
 *   node scripts/generate-problems.mjs
 *   node scripts/generate-problems.mjs --resume          (中断した場合に途中から再開)
 *   node scripts/generate-problems.mjs --category 1_リーチ判断  (特定カテゴリーのみ)
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY  (必須) Claude API キー
 *
 * 他プロジェクトへの流用:
 *   CONFIG の imageDir / outputFile / progressFile を変更するだけで使えます。
 *   プロンプト内の牌コード説明も変更可能です。
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ===== 設定（流用時はここだけ変更） =====
const CONFIG = {
  imageDir:     path.join(ROOT, 'samplequestions'),
  outputFile:   path.join(ROOT, 'src/data/problems.json'),
  progressFile: path.join(__dirname, 'progress.json'),
  model:        'claude-haiku-4-5-20251001',
  delayMs:      800,  // API呼び出し間隔（レート制限対策）
};

// ===== コマンドライン引数 =====
const args = process.argv.slice(2);
const resumeMode     = args.includes('--resume');
const targetCategory = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;

// ===== 牌コード説明（プロンプト用） =====
const TILE_CODE_GUIDE = `
牌コード一覧:
- 萬子: 1m〜9m（赤五萬: 0m）
- 筒子: 1p〜9p（赤五筒: 0p）
- 索子: 1s〜9s（赤五索: 0s）
- 東南西北: 1z 2z 3z 4z
- 白発中: 5z 6z 7z
`.trim();

// ===== プログレスバー表示 =====
let lastLineCount = 0;

function renderProgress(totalDone, totalAll, cat, catDone, catAll, stats) {
  const pct  = totalAll > 0 ? Math.floor((totalDone / totalAll) * 100) : 0;
  const filled = Math.floor(pct / 5);
  const bar  = '█'.repeat(filled) + '░'.repeat(20 - filled);

  // 前回表示分を消す
  if (lastLineCount > 0) {
    process.stdout.write(`\x1b[${lastLineCount}A\x1b[0J`);
  }

  const lines = [
    `[${bar}] ${pct}% (${totalDone}/${totalAll}問)`,
    `カテゴリー: ${cat} (${catDone}/${catAll}問)`,
    `成功: ${stats.success}問  スキップ: ${stats.skipped}問  エラー: ${stats.error}問`,
    '',
  ];
  process.stdout.write(lines.join('\n'));
  lastLineCount = lines.length;
}

// ===== 画像 → 牌データ（Claude API） =====
async function analyzeTileImage(client, imagePath) {
  const imgData   = fs.readFileSync(imagePath);
  const base64    = imgData.toString('base64');
  const ext       = path.extname(imagePath).slice(1).toLowerCase();
  const mediaType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';

  const response = await client.messages.create({
    model: CONFIG.model,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: `この麻雀の何切る問題を解析してください。

${TILE_CODE_GUIDE}

以下のJSON形式だけで回答してください（説明文は不要）:
{
  "tiles": ["牌コード", ...],
  "answer": "正解の牌コード",
  "dora": "ドラ牌コード または null"
}

tiles は手牌14枚すべての牌コードを列挙してください。
answer は「何を切るか」の正解牌（tiles の中の1つ）です。
dora は画像にドラ表示牌が写っている場合のみ記入し、なければ null にしてください。`,
        },
      ],
    }],
  });

  const text      = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`JSONが見つかりません: ${text.slice(0, 100)}`);

  return JSON.parse(jsonMatch[0]);
}

// ===== メイン =====
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('エラー: 環境変数 ANTHROPIC_API_KEY が設定されていません。');
    process.exit(1);
  }

  const client = new Anthropic();

  // 進行状況の読み込み
  let progress = { done: [], errors: [] };
  if (fs.existsSync(CONFIG.progressFile)) {
    progress = JSON.parse(fs.readFileSync(CONFIG.progressFile, 'utf-8'));
    if (resumeMode) {
      console.log(`再開モード: ${progress.done.length}問の処理済みをスキップします\n`);
    } else {
      // --resume なしで実行したら進行状況をリセット
      progress = { done: [], errors: [] };
      console.log('新規モード: 最初から処理します\n');
    }
  }

  // 既存の problems.json を読み込む
  let problems = [];
  if (fs.existsSync(CONFIG.outputFile)) {
    problems = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf-8'));
  }
  let nextId = problems.length > 0 ? Math.max(...problems.map(p => p.id)) + 1 : 1;

  // カテゴリー一覧（数値順）
  const categories = fs.readdirSync(CONFIG.imageDir)
    .filter(f => fs.statSync(path.join(CONFIG.imageDir, f)).isDirectory())
    .filter(cat => !targetCategory || cat === targetCategory)
    .sort((a, b) => parseInt(a) - parseInt(b));

  // 全タスクリストを構築
  const allTasks = [];
  for (const cat of categories) {
    const catDir = path.join(CONFIG.imageDir, cat);
    const images = fs.readdirSync(catDir)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b));
    for (const img of images) {
      allTasks.push({ cat, img, catAll: images.length });
    }
  }

  const stats = { success: 0, skipped: 0, error: 0 };
  let totalDone = 0;

  for (const cat of categories) {
    const catDir = path.join(CONFIG.imageDir, cat);
    const images = fs.readdirSync(catDir)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b));

    for (let i = 0; i < images.length; i++) {
      const img    = images[i];
      const key    = `${cat}/${img}`;
      const imgPath = `/samplequestions/${cat}/${img}`;
      totalDone++;

      renderProgress(totalDone, allTasks.length, cat, i + 1, images.length, stats);

      // 処理済みチェック
      if (resumeMode && progress.done.includes(key)) {
        stats.skipped++;
        continue;
      }

      // problems.json に既に存在するかチェック
      if (problems.some(p => p.image === imgPath)) {
        stats.skipped++;
        progress.done.push(key);
        continue;
      }

      try {
        const parsed = await analyzeTileImage(client, path.join(catDir, img));

        problems.push({
          id:          nextId++,
          section:     cat,
          image:       imgPath,
          tiles:       parsed.tiles   ?? [],
          answer:      parsed.answer  ?? '',
          dora:        parsed.dora    ?? null,
          explanation: '',
        });

        progress.done.push(key);
        stats.success++;

      } catch (err) {
        stats.error++;
        progress.errors.push({ key, error: err.message });
      }

      // 都度保存（中断しても途中まで残る）
      fs.writeFileSync(CONFIG.outputFile,   JSON.stringify(problems, null, 2), 'utf-8');
      fs.writeFileSync(CONFIG.progressFile, JSON.stringify(progress, null, 2), 'utf-8');

      await new Promise(r => setTimeout(r, CONFIG.delayMs));
    }
  }

  // 最終サマリー
  process.stdout.write('\n');
  console.log(`\n完了!`);
  console.log(`  成功:    ${stats.success}問`);
  console.log(`  スキップ: ${stats.skipped}問`);
  console.log(`  エラー:  ${stats.error}問`);
  if (stats.error > 0) {
    console.log(`\nエラー詳細は scripts/progress.json の "errors" を確認してください。`);
    console.log('再実行するには: node scripts/generate-problems.mjs --resume');
  }
}

main().catch(err => {
  console.error('\n予期しないエラー:', err.message);
  process.exit(1);
});
