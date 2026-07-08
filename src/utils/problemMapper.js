// Supabase problems テーブルの行 ⇔ アプリ内 problem オブジェクトの変換。
// アプリ（App.jsx）と管理画面（AdminApp.jsx）の両方で使う唯一の実装。
// フィールドを追加するときはここだけを変更すれば両画面に反映される。

// other_discard は旧形式（単一オブジェクト）と新形式（配列・最大3人分）が混在するため、
// 読み込み時に必ず配列へ正規化する（書き込みは常に配列）
function normalizeOtherDiscards(v) {
  if (!v) return null
  const arr = Array.isArray(v) ? v : [v]
  return arr.length > 0 ? arr : null
}

export function fromDb(p) {
  return {
    ...p,
    problemType:      p.problem_type,
    discardedTile:    p.discarded_tile,
    nakiChoices:      p.naki_choices,
    questionImageUrl: p.question_image_url ?? null,
    // toDbではdora未設定時に''で保存される（bakaze/jikaze/junmeはnull保存）ため、
    // ここで''をnullに正規化しないと再読込後に「未設定」判定（?? / 前問題からの引き継ぎ）が効かなくなる
    dora:             p.dora || null,
    otherDiscards:    normalizeOtherDiscards(p.other_discard),
    scores:           p.scores ?? null,
  }
}

export function toDb(p) {
  return {
    id:                 p.id,
    section:            p.section,
    image:              p.image ?? '',
    tiles:              p.tiles ?? [],
    answer:             p.answer ?? '',
    dora:               p.dora ?? '',
    riichi:             p.riichi ?? null,
    explanation:        p.explanation ?? '',
    reviewed:           p.reviewed ?? false,
    disabled:           p.disabled ?? false,
    melds:              p.melds ?? [],
    problem_type:       p.problemType ?? 'default',
    discarded_tile:     p.discardedTile ?? null,
    naki_choices:       p.nakiChoices ?? [],
    question_image_url: p.questionImageUrl ?? null,
    bakaze:             p.bakaze ?? null,
    kyoku:              p.kyoku  ?? null,
    jikaze:             p.jikaze ?? null,
    junme:              p.junme  ?? null,
    note:               p.note ?? '',
    other_discard:      normalizeOtherDiscards(p.otherDiscards),
    scores:             p.scores ?? null,
  }
}
