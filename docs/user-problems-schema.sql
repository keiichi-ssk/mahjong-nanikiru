-- ============================================================
-- 自作問題集（マイ問題集）Phase 1 — DBスキーマ
-- 実行場所: Supabase ダッシュボード → SQL Editor
-- 計画書: docs/user-problems-plan.md の 4章
-- 作成日: 2026-07-28
-- ============================================================
--
-- 【重要】このファイルは一度に全部実行してよい（上から順に依存している）。
-- 実行後は末尾の「検証」セクションを実行して、意図どおりか確認すること。
--
-- 設計の要点:
--   - 既存 problems には混ぜない（problems の RLS は「書き込みは管理者のみ」のため）
--   - 正誤記録は user_results ではなく user_problems.correct 列に持つ
--     （user_results.problem_id は problems.id への FK で uuid を入れられない）
--   - RLS は「本人の行だけ」。GRANT も忘れずに（無いと 403）
-- ============================================================


-- ------------------------------------------------------------
-- 1. カテゴリ（1階層）
-- ------------------------------------------------------------
create table if not exists public.user_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,          -- 表示順（ドラッグ並べ替え用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_categories is '自作問題のカテゴリ（ユーザーごと・1階層）';


-- ------------------------------------------------------------
-- 2. 問題本体
--    列名は problems に合わせてある（problemMapper の toDb/fromDb をそのまま使うため）
-- ------------------------------------------------------------
create table if not exists public.user_problems (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  category_id    uuid references public.user_categories(id) on delete set null,
  title          text not null default '',     -- 一覧での見出し
  sort_order     int  not null default 0,      -- カテゴリ内の並び順

  -- ここから problems と同じ列
  tiles          jsonb   not null default '[]'::jsonb,
  answer         text    not null default '',
  dora           text    not null default '',
  riichi         boolean,
  explanation    text    not null default '',
  melds          jsonb   not null default '[]'::jsonb,
  problem_type   text    not null default 'default',
  discarded_tile text,
  naki_choices   jsonb   not null default '[]'::jsonb,
  bakaze         text,
  kyoku          int,
  honba          int,
  jikaze         text,
  junme          int,
  note           text    not null default '',
  other_discard  jsonb,
  scores         jsonb,

  -- 自作問題ならではの列
  source         text,        -- 'manual' | 'paifu' など入力元の記録
  source_ref     text,        -- 牌譜の局面参照（uuid + 局 + 巡目など）
  correct        boolean,     -- 正誤記録（user_results は使わない）
  answered_at    timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.user_problems is '自作問題（ユーザーごと・本人のみ閲覧可）';
comment on column public.user_problems.correct is
  '正誤記録。user_results.problem_id は problems.id への FK のため、自作問題はこの列に持つ';


-- ------------------------------------------------------------
-- 3. インデックス
--    RLS により全クエリに user_id 条件が入るため必須
-- ------------------------------------------------------------
create index if not exists user_categories_user_id_idx
  on public.user_categories (user_id, sort_order);

create index if not exists user_problems_user_id_idx
  on public.user_problems (user_id);

create index if not exists user_problems_category_id_idx
  on public.user_problems (category_id, sort_order);


-- ------------------------------------------------------------
-- 4. updated_at の自動更新
--    アプリ側で毎回セットし忘れても腐らないようトリガーで担保する
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_categories_set_updated_at on public.user_categories;
create trigger user_categories_set_updated_at
  before update on public.user_categories
  for each row execute function public.set_updated_at();

drop trigger if exists user_problems_set_updated_at on public.user_problems;
create trigger user_problems_set_updated_at
  before update on public.user_problems
  for each row execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 5. RLS（本人の行のみ・全操作可）
-- ------------------------------------------------------------
alter table public.user_categories enable row level security;
alter table public.user_problems   enable row level security;

drop policy if exists "own categories" on public.user_categories;
create policy "own categories" on public.user_categories
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own problems" on public.user_problems;
create policy "own problems" on public.user_problems
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 6. GRANT
--    ★ RLS ポリシーだけでは不十分。GRANT が無いと 403 が返る
--      （CLAUDE.md「Supabase の知見」参照）
-- ------------------------------------------------------------
grant select, insert, update, delete on public.user_categories to authenticated;
grant select, insert, update, delete on public.user_problems   to authenticated;


-- ============================================================
-- 検証（ここから下は上のDDLとは別に、確認したいときに実行する）
-- ============================================================

-- (1) テーブルと RLS 有効化の確認
--     rowsecurity が両方 true になっていること
--
-- select tablename, rowsecurity
--   from pg_tables
--  where schemaname = 'public'
--    and tablename in ('user_categories', 'user_problems');


-- (2) ポリシーの確認（各テーブル1件ずつ出ること）
--
-- select tablename, policyname, cmd
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('user_categories', 'user_problems');


-- (3) GRANT の確認（authenticated に SELECT/INSERT/UPDATE/DELETE が出ること）
--
-- select table_name, privilege_type
--   from information_schema.role_table_grants
--  where grantee = 'authenticated'
--    and table_name in ('user_categories', 'user_problems')
--  order by table_name, privilege_type;


-- (4) 動作確認用のテストデータ投入
--     ★ SQL Editor は service_role で動くため RLS を迂回する。
--       ここでは user_id を明示的に自分のものにする必要がある。
--       下の <YOUR_USER_ID> は (5) で調べた値に置き換えること。
--
-- insert into public.user_categories (user_id, name, sort_order)
-- values ('<YOUR_USER_ID>', 'テストカテゴリ', 0);
--
-- insert into public.user_problems (user_id, category_id, title, tiles, answer, dora, junme)
-- select '<YOUR_USER_ID>', id, 'テスト問題',
--        '["1m","2m","3m","4m","5m","6m","7m","8m","9m","1p","2p","3p","5s","5s"]'::jsonb,
--        '5s', '1z', 9
--   from public.user_categories
--  where user_id = '<YOUR_USER_ID>' and name = 'テストカテゴリ';


-- (5) 自分の user_id を調べる
--
-- select id, email from auth.users where email = 'raguneru1423@gmail.com';


-- (6) 後片付け（テストデータを消すとき）
--
-- delete from public.user_problems   where title = 'テスト問題';
-- delete from public.user_categories where name  = 'テストカテゴリ';
