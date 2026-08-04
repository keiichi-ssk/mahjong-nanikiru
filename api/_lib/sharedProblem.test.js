// 共有トークンから問題を取る処理のテスト。
// api/ 配下はローカルでもCIでも「実行」できないため、**壊れても本番でしか気づけない**。
// せめて fetch をモックして、返す形と失敗理由の切り分けだけは固定しておく。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchSharedProblemResult, isShareToken } from './sharedProblem.js';

const TOKEN = '11111111-2222-3333-4444-555555555555';
// service_role を模した JWT（署名は検証しないので payload だけ本物らしくしてある）
const JWT = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'service_role' }))}.sig`;

const ROW = {
  id: 'p1',
  title: '実戦の一打',
  tiles: ['2m', '3m', '4m', '5p', '6p', '7p', '3s', '4s', '5s', '7s', '8s', '1z', '1z', '9m'],
  answer: '9m',
  dora: '4z',
  melds: [],
  problem_type: 'default',
};

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = JWT;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

const mockFetch = (status, body) => {
  globalThis.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
};

describe('fetchSharedProblemResult', () => {
  // ★★ これが今回の本命 ★★
  // isUserProblem が落ちると出題側が公式問題とみなし、スーツ置換されて牌姿が変わる。
  // 共有された問題は「元の牌姿のまま議論する」ためのものなので、絶対に付けること
  it('自作問題であることを示す isUserProblem を必ず付ける（スーツ置換を防ぐ）', async () => {
    mockFetch(200, [ROW]);
    const { problem } = await fetchSharedProblemResult(TOKEN);
    expect(problem.isUserProblem).toBe(true);
    expect(problem.tiles).toEqual(ROW.tiles);
  });

  it('DB行をアプリ内の形に変換して返す', async () => {
    mockFetch(200, [ROW]);
    const { problem, reason } = await fetchSharedProblemResult(TOKEN);
    expect(reason).toBeNull();
    expect(problem.title).toBe('実戦の一打');
    expect(problem.problemType).toBe('default');
  });

  // 失敗の理由は本番で切り分ける唯一の手がかりなので、区別できる状態を保つ
  it('トークンの形式が不正なら invalid-token', async () => {
    mockFetch(200, [ROW]);
    expect((await fetchSharedProblemResult('abc')).reason).toBe('invalid-token');
  });

  it('環境変数が無ければ not-configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    mockFetch(200, [ROW]);
    expect((await fetchSharedProblemResult(TOKEN)).reason).toBe('not-configured');
  });

  it('行が無ければ no-row', async () => {
    mockFetch(200, []);
    expect((await fetchSharedProblemResult(TOKEN)).reason).toBe('no-row');
  });

  // 403 は GRANT 不足の症状（RLS で弾かれる場合は 0 件の正常応答になる）
  it('403 のときは PostgreSQL のエラーコードまで返す', async () => {
    mockFetch(403, { code: '42501' });
    expect((await fetchSharedProblemResult(TOKEN)).reason).toContain('42501');
  });
});

describe('isShareToken', () => {
  it('uuid だけを受け付ける', () => {
    expect(isShareToken(TOKEN)).toBe(true);
    expect(isShareToken('abc')).toBe(false);
    expect(isShareToken(null)).toBe(false);
  });
});
