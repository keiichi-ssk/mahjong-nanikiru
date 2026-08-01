// ログインせずに作っていた問題の下書きを、ログインを挟んでも失わないための退避先。
//
// my問題集は未ログインでも作問できる（保存だけができない）。そこで「ログインして保存」を押したときに
// 画面の内容をここへ書き出し、OAuth から戻ってきたら読み直して保存できるようにする。
//
// ★ sessionStorage を使うのはタブ単位で完結させるため。OAuth は同じタブで往復するので値は残り、
//   タブを閉じれば消える（他人の端末に作りかけが残らない）。localStorage にしないこと。
// ★ ここは入れ物であって検証はしない。読み出した値は呼び出し側で
//   makeNewUserProblem() に重ねてから使うこと（見知らぬキーを DB へ送らないため）。

const KEY = 'mpGuestDraft'

// sessionStorage が無い環境（テストの node 実行・プライベートモードの一部）でも落ちないようにする
function defaultStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

/** 下書きを退避する。書き込めなければ false（呼び出し側は保存を促さないなどの判断に使える） */
export function saveGuestDraft(problem, storage = defaultStorage()) {
  if (!storage || !problem) return false
  try {
    storage.setItem(KEY, JSON.stringify(problem))
    return true
  } catch {
    return false
  }
}

/** 退避した下書きを読む。無ければ・壊れていれば null */
export function loadGuestDraft(storage = defaultStorage()) {
  if (!storage) return null
  let raw
  try {
    raw = storage.getItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    // 配列や文字列が入っていたら下書きとして扱わない
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** 保存が済んだ・破棄したときに消す */
export function clearGuestDraft(storage = defaultStorage()) {
  if (!storage) return
  try {
    storage.removeItem(KEY)
  } catch {
    // 消せなくても実害は無い（次回の読み出しで上書きされる）
  }
}
