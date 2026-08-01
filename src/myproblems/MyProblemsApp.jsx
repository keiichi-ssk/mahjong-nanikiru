import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import ProblemEditor from '../admin/ProblemEditor'
import { toUserDb, fromUserDb, makeNewUserProblem } from '../utils/userProblemMapper'
import { PROBLEM_TYPE_LABELS } from '../utils/problemConstants'
import { normalizeProblemType } from '../utils/judgeUtils'
import PaifuImport from './PaifuImport'
import EditorGuide from './EditorGuide'
import ShareButton from '../components/ShareButton'
import { MAX_PROBLEMS, MAX_CATEGORIES, MAX_EXPLANATION, MAX_NOTE, insertErrorText } from './limits'
import { snapshotToProblem } from '../utils/importBoard'
import { openProblemShare } from '../utils/shareWindow'
import { loadGuestDraft, saveGuestDraft, clearGuestDraft } from './guestDraft'
import {
  validatePaifu, listRounds, listSteps, snapshotAt, filterSteps, defaultProblemTitle,
} from '../utils/tenhouPaifu'

// 自作問題集（my問題集(β)）の作成画面。
// 計画: docs/user-problems-plan.md
//
// ★ 作問そのものはログイン不要（2026-08-01〜）。ログインが要るのは**保存だけ**で、
//   未ログインでも問題を作って X で共有できる（問題の中身は URL に入るので DB を使わない）。
//   未ログイン時はカテゴリ・問題一覧（DB前提）を出さず、いきなりエディタを開く。
//   作りかけの内容は「ログインして保存」を押した時点で sessionStorage へ退避し（guestDraft.js）、
//   OAuth から戻ったら復元して保存できる。**この往復を壊さないこと**（作った問題が消える体験になる）。
//
// 保存まわりのゲートは「ログインしているか」だけ（2026-07-28 一般公開）。
// allowed_users（公式問題の閲覧許可リスト）にも is_admin にも依存しない。
// 実効防御は user_problems / user_categories の RLS（auth.uid() = user_id）で、
// 作れる件数・文字数の上限も DB 側で強制する（UIで止めても anon キーで直接叩けるため）。

// サイドバーで「未分類」を選んでいる状態。null（＝カテゴリ未選択）と区別する必要があるため
// 専用の値を使う（category_id が null の問題にもアクセスできるようにするため）
const UNCATEGORIZED = '__uncategorized__'

// カテゴリと問題をまとめて取得する。
// setState を持たない純粋な取得関数にしてあるのは、effect から同期的に呼んでも
// 「effect 内の setState」（cascading render）の lint に触れないようにするため。
//
// RLS は弾いたときエラーではなく「0件の正常応答」を返すため、
// エラーの有無ではなく件数で成否を判断すること（CLAUDE.md「Supabase の知見」）
async function fetchAll() {
  const [cats, probs] = await Promise.all([
    supabase.from('user_categories').select('*').order('sort_order'),
    // 一覧・出題順ともに表示番号（#1, #2 …）に揃える。
    // sort_order（カテゴリ内の手動並べ替え用）は将来のために列だけ残してある
    supabase.from('user_problems').select('*').order('display_no'),
  ])
  const error = cats.error || probs.error
  if (error) return { error: error.message }
  return {
    categories: cats.data ?? [],
    problems: (probs.data ?? []).map(fromUserDb),
  }
}

// ログイン中のアカウントの表示。画面共有や撮影で写るので伏せ字にする。
// 見分けがつけばよいので、頭1文字とドメインだけ残す（r***@gmail.com）
function maskEmail(email) {
  if (!email) return ''
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  return `${email[0]}***${email.slice(at)}`
}

// 一覧に出す1行ぶんの要約。ラベルは problemConstants に集約してある
// （管理画面のセレクタと文言がズレないようにするため）
function problemSummary(p) {
  const type = normalizeProblemType(p.problemType)
  return PROBLEM_TYPE_LABELS[type] ?? type
}

// 解説・注釈の文字数上限（DB 側の CHECK 制約と同じ値）。
// 書いてから保存で弾かれるのを防ぐため、入力欄の maxLength と残数表示に使う
const TEXT_LIMITS = { explanation: MAX_EXPLANATION, note: MAX_NOTE }

// Google ログインを始める。ログイン画面と「ログインして保存」の両方から呼ぶ。
// ★ redirectTo に window.location.href を使わないこと。OAuth 後に付くハッシュ（#access_token=…）が
//   混ざると Redirect URLs にマッチせず Site URL（本番）へ飛ばされる
//   （CLAUDE.md「特定の画面だけログインボタンが効かない」）
async function signIn() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  })
  if (error) console.error('OAuth error:', error)
}

// 1問ぶんの編集ペイン。
// 番号・タイトル・カテゴリは**左の一覧から**変更するので、ここでは持たない
// （同じ設定の入口が2つあると、どちらが有効か分からなくなるため）。
// 保存時は問題が元々持っている値をそのまま引き継ぐ。
function ProblemPane({ problem, prevProblem, hasNext, onSave, onSaveAndNext, onShare, saveStatus }) {
  // buildSaveData は {...problem} を土台にするので title / categoryId は自動で残る
  return (
    <ProblemEditor
      problem={problem}
      prevProblem={prevProblem}
      hasNext={hasNext}
      hideImage
      hideReviewed
      hideDelete
      hideBoardView
      headerLead={<h3 className="editor-title">#{problem.displayNo ?? '—'}</h3>}
      paletteAside={<EditorGuide mode="manual" />}
      textLimits={TEXT_LIMITS}
      saveStatus={saveStatus}
      onSave={onSave}
      onSaveAndNext={onSaveAndNext}
      // 共有は一覧（↗）だけでは気づけないので、編集中の画面からも出せるようにする（2026-08-01〜）。
      // 共有されるのは buildSaveData() ＝ 未保存の編集も含む「いま見えている内容」
      onShare={onShare}
      onDelete={() => {}}
    />
  )
}

export default function MyProblemsApp() {
  const [session, setSession]         = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [categories, setCategories] = useState([])
  const [problems, setProblems]     = useState([])
  const [ready, setReady]           = useState(false)
  const [loadError, setLoadError]   = useState(null)

  const [selectedCatId, setSelectedCatId]   = useState(null)
  const [selectedProbId, setSelectedProbId] = useState(null)
  // メイン領域の表示。'editor' = 保存済みの問題を編集 / 'paifu' = 牌譜から局面を切り出す（未保存）
  const [view, setView]                     = useState('editor')
  // 読み込んだ牌譜と、いま見ている局面。
  // ★ 牌譜から作った問題は「保存」で初めて user_problems に入る（作りかけが溜まらないようにするため）
  const [paifu, setPaifu]               = useState(null)
  const [paifuFile, setPaifuFile]       = useState('')
  const [paifuError, setPaifuError]     = useState('')
  // stepIndex は listSteps のインデックス（局面）。filter は画面での絞り込み
  const [draft, setDraft]               = useState({ roundIndex: 0, seat: 0, stepIndex: 0, filter: 'self' })
  const [draftCategoryId, setDraftCategoryId] = useState(null)
  // 保存済みの局面（同じ局面を続けて保存してしまわないよう画面で知らせる）
  const [savedKeys, setSavedKeys]       = useState(() => new Set())
  const [newName, setNewName]               = useState('')
  const [editingId, setEditingId]           = useState(null)
  const [editingName, setEditingName]       = useState('')
  // 問題一覧での番号・タイトルの直接編集
  const [editingProbId, setEditingProbId]   = useState(null)
  const [editProbTitle, setEditProbTitle]   = useState('')
  const [editProbNo, setEditProbNo]         = useState('')
  const [editProbCat, setEditProbCat]       = useState('')
  const [status, setStatus]                 = useState('')
  // ログイン前に作っていた問題（sessionStorage）。
  // 未ログイン時はこれが編集対象、ログイン後は「保存できる1問」として復元する。
  // 読み出しは初期化時の1回だけ（編集中に差し替わると ProblemEditor の中身が飛ぶため）
  const [guestDraft, setGuestDraft]         = useState(() => loadGuestDraft())
  // 保存ボタンの隣に出す状態表示。{ text, error } | null
  // 成功は数秒で自動的に消す（消えずに残っていると、次の保存で変化が無く保存されたか分からないため）
  const [editorStatus, setEditorStatus]     = useState(null)
  const editorStatusTimer                   = useRef(null)
  const paifuFileRef                        = useRef(null)

  useEffect(() => () => clearTimeout(editorStatusTimer.current), [])

  function showSaved(text) {
    clearTimeout(editorStatusTimer.current)
    setEditorStatus({ text, error: false })
    editorStatusTimer.current = setTimeout(() => setEditorStatus(null), 2500)
  }

  // エラーは自動で消さない（読み逃すため）
  function showSaveError(text) {
    clearTimeout(editorStatusTimer.current)
    setEditorStatus({ text, error: true })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // my問題集(β)は「ログイン済みなら誰でも使える」（2026-07-28 一般公開）。
  // allowed_users（公式問題の閲覧許可）とも is_admin とも無関係で、
  // user_problems / user_categories の RLS は auth.uid() だけを見ている。
  // 作れる件数の上限は DB 側（RLS の with check）で強制する
  const userId  = session?.user?.id ?? null

  // ===== 牌譜のドラフト（描画時に導出する） =====
  // 選べる局面は「局 × 席 × 絞り込み」で変わるので、state はそのままにして
  // 描画時に有効な局面へ寄せる（effect で setState すると cascading render になるため）
  const paifuRounds = useMemo(() => (paifu ? listRounds(paifu) : []), [paifu])
  const allSteps    = useMemo(
    () => (paifu ? listSteps(paifu, draft.roundIndex) : []),
    [paifu, draft.roundIndex],
  )
  const visibleSteps = useMemo(
    () => filterSteps(allSteps, draft.filter, draft.seat),
    [allSteps, draft.filter, draft.seat],
  )
  // 選択中の局面が絞り込みから外れていたら、その中の先頭に寄せる
  const currentStep = visibleSteps.find(s => s.index === draft.stepIndex) ?? visibleSteps[0] ?? null
  const stepIndex   = currentStep?.index ?? -1
  // 局面が変わったらエディタを作り直すためのキー（保存済みの記録にも使う）
  const draftKey = `${draft.roundIndex}-${draft.seat}-${stepIndex}`

  const paifuResult = useMemo(
    () => (paifu && stepIndex >= 0
      ? snapshotAt(paifu, draft.roundIndex, stepIndex, { seat: draft.seat })
      : null),
    [paifu, draft.roundIndex, draft.seat, stepIndex],
  )

  // 他家の手牌の実際の枚数（ツモ直後なら14枚）。盤面の裏向きの枚数に使う。
  // problem には保存されない表示専用の情報
  const concealedCounts = useMemo(() => {
    const seats = paifuResult?.snapshot?.seats
    if (!seats) return null
    return Object.fromEntries(
      Object.entries(seats).map(([wind, s]) => [wind, s.hand.length])
    )
  }, [paifuResult])

  // 盤面だけが埋まった未保存の問題。正解・解説はエディタで人が設定する
  // （牌譜に入っているのは実際に切った牌であって正解ではない）
  const draftProblem = useMemo(() => {
    if (!paifuResult) return null
    const board = snapshotToProblem(paifuResult.snapshot)
    return {
      ...makeNewUserProblem(),
      ...board,
      title: defaultProblemTitle(paifu, draft.roundIndex, board.junme),
    }
  }, [paifuResult, paifu, draft.roundIndex])

  // 退避してあった下書き。見知らぬキーをそのまま DB へ送らないよう、
  // 必ず makeNewUserProblem() に重ねてから使う（guestDraft.js は検証をしない入れ物）
  const guestProblem = useMemo(
    () => ({ ...makeNewUserProblem(), ...(guestDraft ?? {}) }),
    [guestDraft],
  )

  // ===== 選択中のカテゴリ（描画時に導出する） =====
  // ★ 何も選ばれていない状態を作らない（2026-08-01〜）。未選択だと「＋ 新しい問題」が押せず、
  //   何から始めればいいのか分からないため、先頭のカテゴリ（無ければ未分類）へ寄せる。
  //   state は書き換えない（effect 内の setState は cascading render になるため）ので、
  //   カテゴリを削除して選択が外れたときも自動的に次の候補へ移る
  const uncategorized = problems.filter(p => p.categoryId == null)
  const activeCatId   = selectedCatId
    ?? categories[0]?.id
    ?? (uncategorized.length > 0 ? UNCATEGORIZED : null)
  // 問題を作る先のカテゴリ（未分類は null で保存する）
  const activeCatValue = activeCatId === UNCATEGORIZED ? null : activeCatId

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false
    fetchAll().then(r => {
      if (cancelled) return
      if (r.error) { setLoadError(r.error); return }
      setLoadError(null)
      setCategories(r.categories)
      setProblems(r.problems)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [session])

  // 操作後の再取得。イベントハンドラからだけ呼ぶ（effect からは上の Promise チェーンを使う）
  async function reload() {
    const r = await fetchAll()
    if (r.error) { setLoadError(r.error); return }
    setLoadError(null)
    setCategories(r.categories)
    setProblems(r.problems)
    setReady(true)
  }

  // ===== カテゴリ操作 =====

  async function addCategory() {
    const name = newName.trim()
    if (!name || !userId) return
    // 並び順は末尾。既存が空なら 0
    const nextOrder = categories.length > 0
      ? Math.max(...categories.map(c => c.sort_order ?? 0)) + 1
      : 0
    const { data, error } = await supabase
      .from('user_categories')
      .insert({ user_id: userId, name, sort_order: nextOrder })
      .select('id')
    // 上限は DB 側（RLS）で止まる。エラー文がそのままだと理由が伝わらないので置き換える
    if (error) { setStatus(insertErrorText(error, { kind: 'category', count: categories.length })); return }
    // RLS で弾かれると 0 行のまま成功扱いになるため、実際に入ったかを確認する
    if (!data || data.length === 0) { setStatus('追加できませんでした（権限の可能性）'); return }
    setNewName('')
    setStatus('追加しました ✓')
    await reload()
  }

  async function renameCategory(id) {
    const name = editingName.trim()
    if (!name) return
    const { data, error } = await supabase
      .from('user_categories')
      .update({ name })
      .eq('id', id)
      .select('id')
    if (error) { setStatus(`変更に失敗しました: ${error.message}`); return }
    if (!data || data.length === 0) { setStatus('変更できませんでした（権限の可能性）'); return }
    setEditingId(null)
    setEditingName('')
    setStatus('変更しました ✓')
    await reload()
  }

  // ↑↓ での並べ替え。
  // useDragReorder は横並び前提（clientX だけで挿入位置を決める）なので縦のリストには使えない。
  // 入れ替え後は sort_order を index で振り直す（初期値が重複していても壊れないように）
  async function moveCategory(index, dir) {
    const to = index + dir
    if (to < 0 || to >= categories.length) return
    const next = [...categories]
    ;[next[index], next[to]] = [next[to], next[index]]
    setCategories(next)   // 先に見た目を動かす
    const results = await Promise.all(
      next.map((c, i) => supabase.from('user_categories').update({ sort_order: i }).eq('id', c.id))
    )
    const failed = results.find(r => r.error)
    if (failed) { setStatus(`並べ替えに失敗しました: ${failed.error.message}`); await reload(); return }
    setStatus('並べ替えました ✓')
  }

  async function deleteCategory(cat) {
    const count = problems.filter(p => p.categoryId === cat.id).length
    const message = count > 0
      ? `カテゴリ「${cat.name}」を削除しますか？\n\nこのカテゴリの問題 ${count} 問は削除されず「未分類」になります。`
      : `カテゴリ「${cat.name}」を削除しますか？`
    if (!window.confirm(message)) return
    const { data, error } = await supabase
      .from('user_categories')
      .delete()
      .eq('id', cat.id)
      .select('id')
    if (error) { setStatus(`削除に失敗しました: ${error.message}`); return }
    // RLS では条件に合わない行が「0行削除の成功」として返るため、実削除行数を検証する
    if (!data || data.length === 0) { setStatus('削除できませんでした（権限の可能性）'); return }
    if (selectedCatId === cat.id) setSelectedCatId(null)
    setStatus('削除しました ✓')
    await reload()
  }

  function startEditing(cat) {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  // ===== 問題操作 =====

  // 問題を選ぶと必ず編集画面に戻す（牌譜画面を開いたままだと選んだ問題が見えない）
  function selectProblem(id) {
    setSelectedProbId(id)
    setView('editor')
  }

  async function addProblem() {
    if (!userId || !activeCatId) return
    // user_id は insert のときだけ付ける（toUserDb は含めない）
    const row = { ...toUserDb(makeNewUserProblem(), { categoryId: activeCatValue }), user_id: userId }
    const { data, error } = await supabase.from('user_problems').insert(row).select('*')
    if (error) { setStatus(insertErrorText(error, { kind: 'problem', count: problems.length })); return }
    if (!data || data.length === 0) { setStatus('追加できませんでした（権限の可能性）'); return }
    await reload()
    selectProblem(data[0].id)
    setStatus('問題を追加しました ✓')
  }

  // ===== 牌譜から作る =====

  async function readPaifuFile(file) {
    if (!file) return
    try {
      const json = JSON.parse(await file.text())
      const check = validatePaifu(json)
      if (!check.ok) { setPaifu(null); setPaifuFile(file.name); setPaifuError(check.reason); return }
      setPaifu(json)
      setPaifuFile(file.name)
      setPaifuError('')
      // 牌譜が変わったら局面と保存済みの記録は最初に戻す
      setDraft({ roundIndex: 0, seat: 0, stepIndex: 0, filter: 'self' })
      setSavedKeys(new Set())
      setDraftCategoryId(activeCatValue)
      setView('paifu')
    } catch {
      setPaifu(null)
      setPaifuFile(file.name)
      setPaifuError('JSONとして読み取れませんでした')
    }
  }

  // 牌譜から切り出した局面を1問として保存する（insert）。
  // 保存後もドラフトは残すので、続けて別の局面を切り出せる
  async function saveDraft(updated) {
    if (!userId) return false
    const row = {
      ...toUserDb(updated, { categoryId: draftCategoryId }),
      user_id: userId,
    }
    const { data, error } = await supabase.from('user_problems').insert(row).select('id')
    if (error) { showSaveError(insertErrorText(error, { kind: 'problem', count: problems.length })); return false }
    if (!data || data.length === 0) { showSaveError('保存できませんでした（権限の可能性）'); return false }
    showSaved('保存しました ✓')
    setSavedKeys(prev => new Set(prev).add(draftKey))
    await reload()
    return true
  }

  // ログイン前に作っていた1問を保存する（insert）。保存できたら退避を消し、その問題を開く。
  // 保存先カテゴリは牌譜ドラフトと同じ draftCategoryId を使う（ヘッダーの「保存先」）
  async function saveRestoredDraft(updated) {
    if (!userId) return false
    const row = { ...toUserDb(updated, { categoryId: draftCategoryId }), user_id: userId }
    const { data, error } = await supabase.from('user_problems').insert(row).select('*')
    if (error) { showSaveError(insertErrorText(error, { kind: 'problem', count: problems.length })); return false }
    if (!data || data.length === 0) { showSaveError('保存できませんでした（権限の可能性）'); return false }
    clearGuestDraft()
    setGuestDraft(null)
    showSaved('保存しました ✓')
    // 保存先のカテゴリを開いておかないと、保存した問題が一覧に出てこない
    setSelectedCatId(draftCategoryId ?? UNCATEGORIZED)
    await reload()
    selectProblem(data[0].id)
    return true
  }

  function discardGuestDraft() {
    if (!window.confirm('ログイン前に作っていた問題を破棄しますか？\nこの操作は取り消せません。')) return
    clearGuestDraft()
    setGuestDraft(null)
  }

  async function saveProblem(updated) {
    if (!userId) return false
    // 更新では user_id を送らない（行の所有者は変わらないため）
    const row = toUserDb(updated, { categoryId: updated.categoryId ?? null })
    const { data, error } = await supabase
      .from('user_problems')
      .update(row)
      .eq('id', updated.id)
      .select('id')
    if (error) { showSaveError(`保存に失敗: ${error.message}`); return false }
    if (!data || data.length === 0) { showSaveError('保存できませんでした（権限の可能性）'); return false }
    showSaved('保存しました ✓')
    await reload()
    return true
  }

  async function saveProblemAndNext(updated) {
    const list = visibleProblems
    const i = list.findIndex(p => p.id === updated.id)
    const ok = await saveProblem(updated)
    if (!ok) return
    if (i >= 0 && i < list.length - 1) selectProblem(list[i + 1].id)
  }

  function startEditingProb(p) {
    setEditingProbId(p.id)
    setEditProbTitle(p.title ?? '')
    setEditProbNo(String(p.displayNo ?? ''))
    setEditProbCat(p.categoryId ?? '')
  }

  // 一覧から番号・タイトル・カテゴリを直接変更する（エディタ側には同じ設定を置かない）。
  // 番号が既に使われていたら相手と入れ替える（display_no に unique 制約は無いので
  // 一時的に重複しても問題なく、2行の更新だけで済む）
  async function saveProbMeta(p) {
    const title = editProbTitle.trim()
    const raw = editProbNo.trim()
    // 空欄は「変更しない」扱い（番号を消せてしまうと並び順が崩れるため）
    const no = raw === '' ? p.displayNo : Number(raw)
    if (no !== null && (!Number.isInteger(no) || no < 1)) {
      setStatus('番号は1以上の整数で入力してください')
      return
    }

    const tasks = []
    if (no !== p.displayNo) {
      const conflict = problems.find(x => x.id !== p.id && x.displayNo === no)
      if (conflict) {
        tasks.push(supabase.from('user_problems')
          .update({ display_no: p.displayNo }).eq('id', conflict.id).select('id'))
      }
    }
    tasks.push(supabase.from('user_problems')
      .update({ title, display_no: no, category_id: editProbCat || null })
      .eq('id', p.id).select('id'))

    const settled = await Promise.all(tasks)
    const failed = settled.find(r => r.error)
    if (failed) { setStatus(`変更に失敗しました: ${failed.error.message}`); return }
    if (settled.some(r => !r.data || r.data.length === 0)) {
      setStatus('変更できませんでした（権限の可能性）')
      return
    }
    setEditingProbId(null)
    setStatus('変更しました ✓')
    await reload()
  }

  // 一覧から直接 X へ共有する。問題の中身は URL に埋め込まれる（DBは公開しない）。
  // タブを開く手順（ポップアップブロック対策）は openProblemShare が持つ
  async function shareProblem(p) {
    if (!(await openProblemShare(p))) setStatus('共有リンクを作成できませんでした')
  }

  async function deleteProblem(p) {
    if (!window.confirm(`問題「${p.title || '（無題）'}」を削除しますか？\nこの操作は取り消せません。`)) return
    const { data, error } = await supabase
      .from('user_problems')
      .delete()
      .eq('id', p.id)
      .select('id')
    if (error) { setStatus(`削除に失敗しました: ${error.message}`); return }
    if (!data || data.length === 0) { setStatus('削除できませんでした（権限の可能性）'); return }
    if (selectedProbId === p.id) setSelectedProbId(null)
    setStatus('問題を削除しました ✓')
    await reload()
  }

  // 一覧・エディタの共通の共有導線。問題の中身は URL に埋め込まれる（DBは公開しない）。
  // タブを開く手順（ポップアップブロック対策）は openProblemShare が持つ
  async function shareFromEditor(p) {
    if (!(await openProblemShare(p))) showSaveError('共有リンクを作成できませんでした')
  }

  if (authLoading) {
    return <div className="admin-auth-screen">読み込み中...</div>
  }

  // ===== 未ログイン：カテゴリ作成を挟まず、いきなり作問画面を出す =====
  // 保存だけができない。作った問題は X で共有でき、「ログインして保存」を押すと
  // 内容を退避してからログインへ進む（戻ってきたら下の復元エディタで保存できる）
  if (!session) {
    const guestPaifu = view === 'paifu'
    const guestSave = updated => {
      if (!saveGuestDraft(updated)) {
        showSaveError('この環境では作りかけを保持できません。先にログインしてください')
        return false
      }
      signIn()
      return false
    }
    return (
      <div className="admin-layout">
        <main className="admin-main">
          <ProblemEditor
            // 局面を切り替えたら作り直す（手牌が変わる以上、入力中の正解・解説は引き継がない）
            key={guestPaifu ? `guest-draft-${draftKey}` : 'guest'}
            problem={guestPaifu ? (draftProblem ?? makeNewUserProblem()) : guestProblem}
            prevProblem={null}
            hasNext={false}
            hideImage
            hideReviewed
            hideDelete
            hideDisabled
            hideBoardView
            hideSaveNext
            lockBoard={guestPaifu}
            concealedCounts={guestPaifu ? concealedCounts : null}
            paletteAside={<EditorGuide mode={guestPaifu ? 'paifu' : 'manual'} canSave={false} />}
            textLimits={TEXT_LIMITS}
            saveLabel="ログインして保存"
            headerLead={
              // ★ 画面上部に別のヘッダー行を足さないこと。盤面の高さは calc(100vh - 24px) 固定なので、
              //   上に行が増えると卓が画面からはみ出す。だから戻る導線もここ（headerLead）に入れる
              <div className="mp-guest-lead">
                <div className="mp-guest-bar">
                  <a className="mp-back-link mp-back-link--inline" href="/">← 座学する麻雀</a>
                  <h3 className="editor-title">my問題集(β)</h3>
                  {guestPaifu ? (
                    <button className="mp-add-btn mp-add-btn--sm" onClick={() => setView('editor')}>
                      手で作る
                    </button>
                  ) : (
                    <>
                      <input
                        ref={paifuFileRef}
                        type="file"
                        accept="application/json,.json"
                        className="paifu-file-input"
                        onChange={e => { readPaifuFile(e.target.files?.[0]); e.target.value = '' }}
                      />
                      <button
                        className="mp-add-btn mp-add-btn--sm"
                        onClick={() => { if (paifu) setView('paifu'); else paifuFileRef.current?.click() }}
                        title="牌譜のJSONファイルから局面を切り出して問題にする"
                      >
                        牌譜から
                      </button>
                    </>
                  )}
                  <span className="mp-guest-note">
                    ログインなしで作れます（保存にはログインが必要）
                  </span>
                </div>
                {guestPaifu && (
                  <PaifuImport
                    paifu={paifu}
                    fileName={paifuFile}
                    error={paifuError}
                    rounds={paifuRounds}
                    roundIndex={draft.roundIndex}
                    seat={draft.seat}
                    steps={visibleSteps}
                    stepIndex={stepIndex}
                    stepFilter={draft.filter}
                    step={currentStep}
                    onPickFile={readPaifuFile}
                    onChangeRound={i => setDraft(d => ({ ...d, roundIndex: i, stepIndex: 0 }))}
                    onChangeSeat={i => setDraft(d => ({ ...d, seat: i }))}
                    onChangeStep={i => { if (i != null) setDraft(d => ({ ...d, stepIndex: i })) }}
                    onChangeFilter={f => setDraft(d => ({ ...d, filter: f }))}
                    // 保存できないので「保存先」は出さない（PaifuImport が null で省く）
                    onChangeCategory={null}
                  />
                )}
              </div>
            }
            saveStatus={editorStatus && (
              <span className={editorStatus.error ? 'editor-save-err' : 'editor-save-ok'}>
                {editorStatus.text}
              </span>
            )}
            onShare={shareFromEditor}
            onSave={guestSave}
            onSaveAndNext={guestSave}
            onDelete={() => {}}
          />
        </main>
      </div>
    )
  }

  // 上限に達しているか（DB 側の RLS と同じ値。limits.js を参照）
  const probFull = problems.length >= MAX_PROBLEMS
  const catFull  = categories.length >= MAX_CATEGORIES

  const visibleProblems = activeCatId === UNCATEGORIZED
    ? uncategorized
    : (activeCatId ? problems.filter(p => p.categoryId === activeCatId) : [])
  const selectedIdx  = visibleProblems.findIndex(p => p.id === selectedProbId)
  const selectedProb = selectedIdx >= 0 ? visibleProblems[selectedIdx] : null

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        {/* 本体からは別タブで開かれるので、ブラウザの「戻る」では帰れない。
            同じタブで出題画面へ移動する（target を付けないこと） */}
        <a className="mp-back-link" href="/">← 座学する麻雀</a>
        <h1 className="admin-sidebar-title">my問題集(β)</h1>

        {/* 一覧が何のリストなのかを明示する。既定でどれかが選ばれている（activeCatId）ので、
            「選ばないと先へ進めない」という指示ではなく現在地の見出しとして置いている */}
        <p className="mp-section-hint">カテゴリを選択してください</p>

        <div className="mp-cat-list">
          {!ready && !loadError && <p className="mp-empty">読み込んでいます...</p>}
          {loadError && <p className="mp-error">取得エラー: {loadError}</p>}
          {ready && categories.length === 0 && (
            <p className="mp-empty">カテゴリがありません。下の欄から追加してください。</p>
          )}

          {categories.map((cat, i) => {
            const count = problems.filter(p => p.categoryId === cat.id).length
            const isEditing = editingId === cat.id
            return (
              <div
                key={cat.id}
                className={`mp-cat-item${activeCatId === cat.id ? ' mp-cat-item--active' : ''}`}
              >
                {isEditing ? (
                  <input
                    className="mp-cat-input"
                    value={editingName}
                    autoFocus
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameCategory(cat.id)
                      if (e.key === 'Escape') { setEditingId(null); setEditingName('') }
                    }}
                    onBlur={() => renameCategory(cat.id)}
                  />
                ) : (
                  <button
                    className="mp-cat-name"
                    onClick={() => { setSelectedCatId(cat.id); setSelectedProbId(null) }}
                    onDoubleClick={() => startEditing(cat)}
                    title="クリックで選択・ダブルクリックで名前を変更"
                  >
                    <span className="mp-cat-label">{cat.name}</span>
                    <span className="mp-cat-count">{count}</span>
                  </button>
                )}

                <div className="mp-cat-actions">
                  <button className="mp-icon-btn" onClick={() => moveCategory(i, -1)} disabled={i === 0} title="上へ">↑</button>
                  <button className="mp-icon-btn" onClick={() => moveCategory(i, 1)} disabled={i === categories.length - 1} title="下へ">↓</button>
                  <button className="mp-icon-btn" onClick={() => startEditing(cat)} title="名前を変更">✎</button>
                  <button className="mp-icon-btn mp-icon-btn--danger" onClick={() => deleteCategory(cat)} title="削除">×</button>
                </div>
              </div>
            )
          })}

          {uncategorized.length > 0 && (
            <div className={`mp-cat-item${activeCatId === UNCATEGORIZED ? ' mp-cat-item--active' : ''}`}>
              <button
                className="mp-cat-name"
                onClick={() => { setSelectedCatId(UNCATEGORIZED); setSelectedProbId(null) }}
              >
                <span className="mp-cat-label">未分類</span>
                <span className="mp-cat-count">{uncategorized.length}</span>
              </button>
            </div>
          )}
        </div>

        {/* 上限は DB 側で止めているが、押しても失敗するだけなので画面でも残数を出して無効化する */}
        <div className="mp-cat-add">
          <input
            className="mp-cat-input"
            placeholder="新しいカテゴリ名"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
            disabled={catFull}
          />
          <button
            className="mp-add-btn"
            onClick={addCategory}
            disabled={!newName.trim() || catFull}
          >
            追加
          </button>
        </div>
        <p className={`mp-limit${catFull ? ' mp-limit--full' : ''}`}>
          {catFull
            ? `カテゴリは${MAX_CATEGORIES}件までです（不要なカテゴリを削除すると追加できます）`
            : `カテゴリ ${categories.length} / ${MAX_CATEGORIES}`}
        </p>

        {/* 選択中カテゴリの問題一覧 */}
        <div className="mp-prob-section">
          <div className="mp-prob-head">
            <span className="mp-prob-head-label">
              問題
              <span className={`mp-limit-badge${probFull ? ' mp-limit--full' : ''}`}>
                {problems.length} / {MAX_PROBLEMS}
              </span>
            </span>
            <div className="mp-prob-head-actions">
              <input
                ref={paifuFileRef}
                type="file"
                accept="application/json,.json"
                className="paifu-file-input"
                onChange={e => { readPaifuFile(e.target.files?.[0]); e.target.value = '' }}
              />
              <button
                className={`mp-add-btn mp-add-btn--sm${view === 'paifu' ? ' mp-add-btn--active' : ''}`}
                onClick={() => {
                  // 読み込み済みならその牌譜の続きへ戻るだけ。未読込ならファイル選択を開く
                  if (paifu) {
                    setDraftCategoryId(activeCatValue)
                    setView('paifu')
                  } else {
                    paifuFileRef.current?.click()
                  }
                }}
                title="牌譜のJSONファイルから局面を切り出して問題にする"
                disabled={probFull}
              >
                牌譜から
              </button>
              <button
                className="mp-add-btn mp-add-btn--sm"
                onClick={addProblem}
                disabled={!activeCatId || probFull}
              >
                ＋ 新しい問題
              </button>
            </div>
          </div>
          {probFull && (
            <p className="mp-limit mp-limit--full">
              問題は{MAX_PROBLEMS}問までです（不要な問題を削除すると追加できます）
            </p>
          )}
          <div className="mp-prob-list">
            {/* 既定でどれかが選ばれるので、ここに来るのは
                「カテゴリも未分類の問題も1つも無い」＝作り始める前だけ */}
            {!activeCatId && <p className="mp-empty">上の欄からカテゴリを追加してください。</p>}
            {activeCatId && visibleProblems.length === 0 && (
              <p className="mp-empty">問題がありません。「＋ 新しい問題」で追加してください。</p>
            )}
            {visibleProblems.map(p => {
              const isEditingProb = editingProbId === p.id
              // input が2つあるので onBlur では確定しない（片方からもう片方へ移るだけで閉じてしまう）
              const editKeys = e => {
                if (e.key === 'Enter') saveProbMeta(p)
                if (e.key === 'Escape') setEditingProbId(null)
              }
              return (
                <div
                  key={p.id}
                  className={`mp-prob-item${selectedProbId === p.id ? ' mp-prob-item--active' : ''}`}
                >
                  {isEditingProb ? (
                    <div className="mp-prob-edit">
                      <input
                        className="mp-prob-no-input"
                        value={editProbNo}
                        inputMode="numeric"
                        aria-label="番号"
                        onChange={e => setEditProbNo(e.target.value)}
                        onKeyDown={editKeys}
                      />
                      <input
                        className="mp-prob-title-input"
                        value={editProbTitle}
                        autoFocus
                        placeholder="タイトル"
                        aria-label="タイトル"
                        onChange={e => setEditProbTitle(e.target.value)}
                        onKeyDown={editKeys}
                      />
                      {/* カテゴリの変更もここに集約する（エディタ側には置かない） */}
                      <select
                        className="mp-prob-cat-select"
                        value={editProbCat}
                        aria-label="カテゴリ"
                        onChange={e => setEditProbCat(e.target.value)}
                        onKeyDown={editKeys}
                      >
                        <option value="">未分類</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <button
                      className="mp-prob-name"
                      onClick={() => selectProblem(p.id)}
                      onDoubleClick={() => startEditingProb(p)}
                      title="クリックで編集・ダブルクリックで番号/タイトル/カテゴリを変更"
                    >
                      <span className="mp-prob-title">
                        {/* 出題画面と同じ番号。採番前（null）は uuid を出さずに — にする */}
                        <span className="mp-prob-no">#{p.displayNo ?? '—'}</span>
                        <span className="mp-prob-label">{p.title || '（無題）'}</span>
                      </span>
                      <span className="mp-prob-sub">
                        {/* 「非表示」にした問題は出題に混ざらない。
                            一覧で分からないと、なぜ出てこないのか追えなくなる */}
                        {p.disabled && <span className="admin-disabled-badge">非表示</span>}
                        {problemSummary(p)}
                      </span>
                    </button>
                  )}

                  <div className="mp-cat-actions">
                    {isEditingProb ? (
                      <>
                        <button className="mp-icon-btn" onClick={() => saveProbMeta(p)} title="確定">✓</button>
                        <button className="mp-icon-btn" onClick={() => setEditingProbId(null)} title="取消">×</button>
                      </>
                    ) : (
                      <>
                        <button className="mp-icon-btn" onClick={() => startEditingProb(p)} title="番号・タイトル・カテゴリを変更">✎</button>
                        <button
                          className="mp-icon-btn mp-icon-btn--danger"
                          onClick={() => deleteProblem(p)}
                          title="削除"
                        >×</button>
                        {/* ロゴだけの「↗」では何のボタンか読み取れなかったため、
                            X のロゴ＋文字のボタンにしてある（ロゴの実装は ShareButton のみ） */}
                        <ShareButton
                          onClick={() => shareProblem(p)}
                          title="この問題をXで共有する"
                        >
                          共有
                        </ShareButton>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {status && <p className="mp-status">{status}</p>}

        <div className="mp-sidebar-foot">
          {/* どのアカウントか見分けられればよいので伏せ字にする（title にも入れないこと） */}
          <span className="mp-user">{maskEmail(session.user.email)}</span>
          <button className="mp-text-btn" onClick={() => supabase.auth.signOut()}>ログアウト</button>
        </div>
      </aside>

      <main className="admin-main">
        {guestDraft ? (
          // ログイン前に作っていた問題。保存すると user_problems に入り、退避は消える。
          // 保存も破棄もせずに他の操作へ移れないのは意図的（見失うと作った内容が消えるため）
          <ProblemEditor
            key="restored-draft"
            problem={guestProblem}
            prevProblem={null}
            hasNext={false}
            hideImage
            hideReviewed
            hideDelete
            hideBoardView
            hideSaveNext
            paletteAside={<EditorGuide mode="manual" />}
            textLimits={TEXT_LIMITS}
            headerLead={
              <div className="mp-guest-lead">
                <div className="mp-guest-bar">
                  <h3 className="editor-title">ログイン前に作っていた問題</h3>
                  <label className="paifu-save-to">
                    保存先
                    <select
                      className="mp-cat-select"
                      value={draftCategoryId ?? ''}
                      onChange={e => setDraftCategoryId(e.target.value || null)}
                    >
                      <option value="">未分類</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <button className="mp-text-btn" onClick={discardGuestDraft}>破棄する</button>
                </div>
              </div>
            }
            saveStatus={editorStatus && (
              <span className={editorStatus.error ? 'editor-save-err' : 'editor-save-ok'}>
                {editorStatus.text}
              </span>
            )}
            onShare={shareFromEditor}
            onSave={saveRestoredDraft}
            onSaveAndNext={saveRestoredDraft}
            onDelete={() => {}}
          />
        ) : view === 'paifu' ? (
          // 牌譜から切り出した局面。まだ保存されていないので key で作り直す
          // （局面が変われば手牌も変わるため、入力中の正解・解説は引き継がない）
          <ProblemEditor
            key={`draft-${draftKey}`}
            problem={draftProblem ?? makeNewUserProblem()}
            prevProblem={null}
            hasNext={false}
            hideImage
            hideReviewed
            hideDelete
            hideBoardView
            // 実在の局面をそのまま出題するのが基本。変えたいときはヘッダーのトグルで解除する
            lockBoard
            concealedCounts={concealedCounts}
            paletteAside={<EditorGuide mode="paifu" />}
            textLimits={TEXT_LIMITS}
            headerLead={
              <PaifuImport
                paifu={paifu}
                fileName={paifuFile}
                error={paifuError}
                rounds={paifuRounds}
                roundIndex={draft.roundIndex}
                seat={draft.seat}
                steps={visibleSteps}
                stepIndex={stepIndex}
                stepFilter={draft.filter}
                step={currentStep}
                saved={savedKeys.has(draftKey)}
                categories={categories}
                categoryId={draftCategoryId}
                onPickFile={readPaifuFile}
                // 局が変わるとステップ番号の意味も変わるので先頭に戻す
                onChangeRound={i => setDraft(d => ({ ...d, roundIndex: i, stepIndex: 0 }))}
                // 席と絞り込みは、外れた局面を描画時に寄せるので stepIndex はそのままでよい
                onChangeSeat={i => setDraft(d => ({ ...d, seat: i }))}
                onChangeStep={i => { if (i != null) setDraft(d => ({ ...d, stepIndex: i })) }}
                onChangeFilter={f => setDraft(d => ({ ...d, filter: f }))}
                onChangeCategory={setDraftCategoryId}
              />
            }
            saveStatus={editorStatus && (
              <span className={editorStatus.error ? 'editor-save-err' : 'editor-save-ok'}>
                {editorStatus.text}
              </span>
            )}
            onShare={shareFromEditor}
            onSave={saveDraft}
            onSaveAndNext={saveDraft}
            onDelete={() => {}}
          />
        ) : selectedProb ? (
          <ProblemPane
            key={selectedProb.id}
            problem={selectedProb}
            prevProblem={selectedIdx > 0 ? visibleProblems[selectedIdx - 1] : null}
            hasNext={selectedIdx < visibleProblems.length - 1}
            onSave={saveProblem}
            onSaveAndNext={saveProblemAndNext}
            onShare={shareFromEditor}
            saveStatus={editorStatus && (
              <span className={editorStatus.error ? 'editor-save-err' : 'editor-save-ok'}>
                {editorStatus.text}
              </span>
            )}
          />
        ) : (
          <div className="mp-placeholder">
            <p className="mp-placeholder-desc">左のリストから問題を選んでください。</p>
            {/* エディタを開く前にしかできない操作（カテゴリ作成・問題追加）はここで案内する。
                手牌から先の手順はエディタ側のガイド（paletteAside）に出る */}
            <EditorGuide mode="start" />
          </div>
        )}
      </main>
    </div>
  )
}
