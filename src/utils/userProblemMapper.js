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

// ★ 相対 import には必ず .js を付けること。
//   このファイルは api/ 配下（Vercel のサーバーレス関数）からも読まれる。Vite は拡張子を
//   補ってくれるが **Node の ESM は補わない**ので、付け忘れると本番の API だけが 500 で落ちる
//   （ローカルもテストも通ってしまうので気づきにくい）。依存先の problemMapper 側も同じ。
import { fromDb, toDb, newProblemBase } from './problemMapper.js'

// toDb が返すが user_problems には無い列。
//   section    … category_id と二重管理になるため持たない（出題時に u:<category_id> として導出する）
//   image      … レガシー列（旧 /samplequestions/... 形式）。現行は question_image_url
//   reviewed   … 公式問題の校正管理用フラグ。自作問題では用途がない（2026-07-28 判断）
//   board_view … 自作問題は常に盤面（麻雀卓）で出題するので切り替える意味がない。
//                判定は problemDisplay.js の usesBoardView() が isUserProblem で行う（2026-07-29）
// id は DB が採番するので payload に含めない（更新は eq('id', ...) で対象を指定する）
export const OMITTED_COLUMNS = ['id', 'section', 'image', 'reviewed', 'board_view']

// user_id は含めない。
// RLS の with check が守ってくれるとはいえ、更新のたびに送る必要がない値なので、
// insert する側だけが付ける（誤って他人の id を混ぜる余地を無くす）
//
// ★★ share_token / answer_tally / answer_version も**意図的に含めない**（2026-08-04）★★
//   いずれも編集画面から書き換える値ではない。問題を保存するたびに送ると、
//   うっかり null で上書きしたときに **既に配った共有リンクが死に、集計も消える**。
//   これらの更新は専用の処理（共有ボタン / api/answer）だけが行うこと。
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
    // 画面に出す番号。採番はDBのトリガーが行うので toUserDb には含めない
    displayNo:  row.display_no ?? null,
    // 共有リンクのトークン。初めて共有したときに発行し、以後は使い回す
    // （＝同じ問題は何度共有しても同じURLになり、編集しても既存リンクで最新が見える）
    shareToken: row.share_token ?? null,
  }
}

// 新規作成時の空の問題。
// 状況設定（ドラ・場風・巡目など）の既定値と前問からの引き継ぎは ProblemEditor 側が持っているので、
// ここでは空にしておき、prevProblem を渡すことで引き継がせる。
//
// 中身は公式問題と共通（newProblemBase）。自作問題に固有なのは title だけ
// （id は DB 採番・section は category_id から導出・image / reviewed は列自体が無い）
export function makeNewUserProblem() {
  return {
    ...newProblemBase(),
    title: '',
  }
}
