// Supabase problems テーブルの行 ⇔ アプリ内 problem オブジェクトの変換。
// アプリ（App.jsx）と管理画面（AdminApp.jsx）の両方で使う唯一の実装。
// フィールドを追加するときはここだけを変更すれば両画面に反映される。

// ★ 相対 import に .js を付けているのは、このファイルが api/ 配下からも読まれるため
//   （Node の ESM は拡張子を補わない。付け忘れると本番の API だけ 500 になる）
import { normalizeMelds } from './problemConstants.js'
import { normalizeTsumogiri } from './importBoard.js'

// other_discard は旧形式（単一オブジェクト）と新形式（配列・最大3人分）が混在するため、
// 読み込み時に必ず配列へ正規化する（書き込みは常に配列）
function normalizeOtherDiscards(v) {
  if (!v) return null
  const arr = Array.isArray(v) ? v : [v]
  return arr.length > 0 ? arr : null
}

// 読み込み時は他家の副露にも「鳴いた元」を補完する（melds が無い旧データは [] になる）。
// ツモ切りフラグ（tsumogiri）は後から足した項目なので、無い旧データは null ＝「分からない」のまま。
// ★ ここで [] や false 埋めにしないこと。既存の問題に「全部手出し」という誤った情報が付く
function readOtherDiscards(v) {
  const arr = normalizeOtherDiscards(v)
  return arr
    ? arr.map(od => ({
        ...od,
        melds: normalizeMelds(od?.melds),
        tsumogiri: normalizeTsumogiri(od?.tsumogiri, (od?.tiles ?? []).length),
      }))
    : null
}

// 書き込み時は tsumogiri が null（＝分からない）なら**キーごと落とす**。
// 読み込み側が null を補うので情報は失われず、
// ツモ切りを持たない大多数の問題の jsonb に意味のない null が増えない
// （toDb(fromDb(row)) が元の行と一致する、という対称性も保たれる）
function writeOtherDiscards(v) {
  const arr = normalizeOtherDiscards(v)
  if (!arr) return null
  return arr.map(od => {
    if (od?.tsumogiri != null) return od
    const { tsumogiri, ...rest } = od ?? {}   // eslint-disable-line no-unused-vars
    return rest
  })
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
    // honba は後から追加したカラム。古い行には無いので null に正規化する
    honba:            p.honba ?? null,
    // 副露の「鳴いた元」(from) は旧データに無いため、読み込み時に補完する（暗槓は null）。
    // これで盤面表示や保存を通じて徐々にデータが埋まっていく
    melds:            normalizeMelds(p.melds),
    otherDiscards:    readOtherDiscards(p.other_discard),
    scores:           p.scores ?? null,
    // 麻雀卓の形で出題するか。後から追加した列なので古い行では false に正規化する
    boardView:        p.board_view ?? false,
  }
}

// 新規作成する問題の「中身」の初期値。公式問題（AdminApp）と自作問題（makeNewUserProblem）が
// 共通で使う土台で、それぞれに固有の列（公式＝id / section / image / reviewed、
// 自作＝title）は呼び出し側が足す。
//
// ★ problems に列を追加したらここにも足すこと。
//   片方の画面にだけ初期値が無いと、新規作成した問題だけ値が undefined のまま保存される
//   （toDb の ?? で既定値には落ちるが、画面の初期表示が意図と食い違う）。
//   取りこぼしは problemMapper.test.js / userProblemMapper.test.js が検出する
export function newProblemBase() {
  return {
    tiles:            [],
    answer:           '',
    dora:             null,
    riichi:           null,
    melds:            [],
    explanation:      '',
    disabled:         false,
    problemType:      'default',
    discardedTile:    null,
    nakiChoices:      [],
    questionImageUrl: null,
    note:             '',
    otherDiscards:    null,
    boardView:        false,
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
    honba:              p.honba  ?? null,
    jikaze:             p.jikaze ?? null,
    junme:              p.junme  ?? null,
    note:               p.note ?? '',
    other_discard:      writeOtherDiscards(p.otherDiscards),
    scores:             p.scores ?? null,
    board_view:         p.boardView ?? false,
  }
}
