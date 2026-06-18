import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const supabase = createClient(
  'https://kbuzeakugzddxaeczbkn.supabase.co',
  'sb_publishable_cHzLBirIqKguOwUrRURi-g_mPLchrHj'
)

const problems = JSON.parse(
  readFileSync(join(__dirname, '../src/data/problems.json'), 'utf-8')
)

// camelCase → snake_case に変換してDBに合わせる
const rows = problems.map(p => ({
  id:             p.id,
  section:        p.section,
  image:          p.image ?? '',
  tiles:          p.tiles ?? [],
  answer:         p.answer ?? '',
  dora:           p.dora ?? '',
  riichi:         p.riichi ?? null,
  explanation:    p.explanation ?? '',
  reviewed:       p.reviewed ?? false,
  melds:          p.melds ?? [],
  problem_type:   p.problemType ?? 'default',
  discarded_tile: p.discardedTile ?? null,
  naki_choices:   p.nakiChoices ?? [],
}))

console.log(`移行対象: ${rows.length} 件`)

// 100件ずつバッチ処理
const BATCH = 100
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const { error } = await supabase.from('problems').upsert(batch)
  if (error) {
    console.error(`エラー (${i}〜${i + batch.length - 1}件目):`, error.message)
    process.exit(1)
  }
  console.log(`✓ ${i + batch.length} 件完了`)
}

console.log('移行完了！')
