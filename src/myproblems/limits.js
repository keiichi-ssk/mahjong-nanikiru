// my問題集の上限。
//
// ★ ここは「案内」であって防御ではない。
//   anon キーは公開されているので、UIで止めても REST を直接叩けば insert できる。
//   実際に止めているのは DB 側（RLS の with check と CHECK 制約）で、
//   その定義は docs/user-problems-schema.sql の「一般公開の準備」にある。
//   **数値を変えるときは必ず両方を直すこと**（片方だけ変えると、
//   UIでは追加できるのに保存だけ失敗する・その逆、という分かりにくい状態になる）。

export const MAX_PROBLEMS      = 20
export const MAX_CATEGORIES    = 5
export const MAX_EXPLANATION   = 200
export const MAX_NOTE          = 200

// 上限にぶつかったときの DB のエラーは
// 「new row violates row-level security policy」で理由が伝わらないので、読める文言に置き換える。
// RLS 違反は上限以外（他人のカテゴリを指定した等）でも起きるため、
// 件数が実際に上限に達しているときだけ言い切る
export function insertErrorText(error, { kind, count }) {
  const raw = error?.message ?? ''
  const isRls = /row-level security/i.test(raw)
  const max   = kind === 'category' ? MAX_CATEGORIES : MAX_PROBLEMS
  const label = kind === 'category' ? 'カテゴリ' : '問題'
  if (isRls && count >= max) {
    return `${label}は${max}件までです。不要な${label}を削除すると追加できます`
  }
  return raw ? `追加に失敗しました: ${raw}` : '追加できませんでした'
}
