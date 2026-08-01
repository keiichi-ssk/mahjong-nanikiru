import { describe, it, expect } from 'vitest'
import { saveGuestDraft, loadGuestDraft, clearGuestDraft } from './guestDraft'

// sessionStorage の代わり（テストは node 環境なので window が無い）
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    get size() { return map.size },
  }
}

describe('guestDraft', () => {
  it('保存した下書きをそのまま読み戻せる', () => {
    const s = fakeStorage()
    const problem = { tiles: ['1m', '2m'], answer: '1m', jikaze: '南', melds: [] }
    expect(saveGuestDraft(problem, s)).toBe(true)
    expect(loadGuestDraft(s)).toEqual(problem)
  })

  it('下書きが無ければ null', () => {
    expect(loadGuestDraft(fakeStorage())).toBe(null)
  })

  it('壊れた値・オブジェクトでない値は null にする（そのまま DB へ送らないため）', () => {
    expect(loadGuestDraft(fakeStorage({ mpGuestDraft: '{壊れ' }))).toBe(null)
    expect(loadGuestDraft(fakeStorage({ mpGuestDraft: '[1,2]' }))).toBe(null)
    expect(loadGuestDraft(fakeStorage({ mpGuestDraft: 'null' }))).toBe(null)
  })

  it('clear すると読めなくなる', () => {
    const s = fakeStorage()
    saveGuestDraft({ tiles: [] }, s)
    clearGuestDraft(s)
    expect(loadGuestDraft(s)).toBe(null)
  })

  it('storage が使えない環境でも落ちない', () => {
    expect(saveGuestDraft({ tiles: [] }, null)).toBe(false)
    expect(loadGuestDraft(null)).toBe(null)
    expect(() => clearGuestDraft(null)).not.toThrow()
  })
})
