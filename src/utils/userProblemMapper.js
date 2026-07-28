// user_problems テーブルの行 ⇔ アプリ内 problem オブジェクトの変換。
// 公式問題（problems）の problemMapper を土台にし、自作問題だけの差分を吸収する唯一の実装。
//
// problems との違い:
//   - id が uuid（DB採番）。書き込みの payload には含めない
//   - カテゴリは section（数値文字列）ではなく category_id（uuid・FK）で持つ
//   - user_id と title を持つ
//   - section / image / reviewed の3列は user_problems に無い（下記 OMITTED_COLUMNS）
//
// 列を足したときは toUserDb にも足すこと。
// 足し忘れは userProblemMapper.test.js の「toDb の列を取りこぼさない」テストが検出する。

import { fromDb, toDb } from './problemMapper'

// toDb が返すが user_problems には無い列。
//   section  … category_id と二重管理になるため持たない（出題時に u:<category_id> として導出する）
//   image    … レガシー列（旧 /samplequestions/... 形式）。現行は question_image_url
//   reviewed … 公式問題の校正管理用フラグ。自作問題では用途がない（2026-07-28 判断）
// id は DB が採番するので payload に含めない（更新は eq('id', ...) で対象を指定する）
export const OMITTED_COLUMNS = ['id', 'section', 'image', 'reviewed']

// user_id は含めない。
// RLS の with check が守ってくれるとはいえ、更新のたびに送る必要がない値なので、
// insert する側だけが付ける（誤って他人の id を混ぜる余地を無くす）
export function toUserDb(p, { categoryId = null } = {}) {
  const db = toDb(p)
  return {
    category_id: categoryId,
    title:       p.title ?? '',

    tiles:              db.tiles,
    answer:             db.answer,
    dora:               db.dora,
    riichi:             db.riichi,
    explanation:        db.explanation,
    disabled:           db.disabled,
    melds:              db.melds,
    problem_type:       db.problem_type,
    discarded_tile:     db.discarded_tile,
    naki_choices:       db.naki_choices,
    question_image_url: db.question_image_url,
    bakaze:             db.bakaze,
    kyoku:              db.kyoku,
    honba:              db.honba,
    jikaze:             db.jikaze,
    junme:              db.junme,
    note:               db.note,
    other_discard:      db.other_discard,
    scores:             db.scores,
  }
}

export function fromUserDb(row) {
  return {
    // fromDb が ...p で全列を展開するので、user_id / correct などもそのまま残る
    ...fromDb(row),
    title:      row.title ?? '',
    categoryId: row.category_id ?? null,
  }
}

// 新規作成時の空の問題。
// 状況設定（ドラ・場風・巡目など）の既定値と前問からの引き継ぎは ProblemEditor 側が持っているので、
// ここでは空にしておき、prevProblem を渡すことで引き継がせる
export function makeNewUserProblem() {
  return {
    title:            '',
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
  }
}
