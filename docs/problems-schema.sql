-- ============================================================
-- 公式問題（problems）テーブルの変更履歴
-- 実行場所: Supabase ダッシュボード → SQL Editor
-- 作成日: 2026-07-29
-- ============================================================
--
-- 【重要】アプリのコードより先にこのSQLを実行すること。
--   順番を逆にすると、アプリが存在しない列を送って保存できなくなる。
--
-- 自作問題（user_problems / user_categories）は docs/user-problems-schema.sql が持つ。
-- こちらは公式問題だけの変更をまとめる。
-- ============================================================


-- ------------------------------------------------------------
-- 1. id の採番を DB 側へ移す（2026-07-29）
--
--    それまではアプリが「現存する問題の最大値 + 1」を計算して指定していた。
--    管理者が複数いて同時に追加すると同じ id を計算し、主キー衝突で失敗する。
--    あわせて「最大 id の問題を削除すると、その番号が次の問題に再利用される」
--    という挙動も無くなる（Storage に残った画像 <id>.png との取り違えを防ぐ）。
--
--    ★ 既存の id は変わらない。
--      user_results.problem_id（FK）も問題画像のファイル名（<id>.拡張子）も
--      そのまま使えるので、移行作業は不要。
-- ------------------------------------------------------------

create sequence if not exists public.problems_id_seq owned by public.problems.id;

-- 次に採番される値を「現在の最大 id + 1」にする。
-- 第3引数 false ＝「まだ呼ばれていない」なので、次の nextval がこの値をそのまま返す
-- （true にすると1つ先へ進んでしまい、最初の1件が欠番になる）。
-- テーブルが空でも coalesce により 1 から始まる
select setval(
  'public.problems_id_seq',
  coalesce((select max(id) from public.problems), 0) + 1,
  false
);

alter table public.problems
  alter column id set default nextval('public.problems_id_seq');

-- ★ シーケンスへの権限を忘れないこと。
--   テーブルへの GRANT だけでは足りず、これが無いと insert が
--   「permission denied for sequence problems_id_seq」で失敗する
--   （テーブルの GRANT 漏れで 403 が返るのと同じ種類の落とし穴）
grant usage, select on sequence public.problems_id_seq to authenticated;


-- ------------------------------------------------------------
-- 2. 盤面（麻雀卓）の形で出題するフラグ（2026-07-29）
--
--    自作問題は常に盤面で出す。公式問題は問題ごとに管理画面で切り替える。
--    既存の問題はすべて従来表示のまま（default false）。
--    判定は src/utils/problemDisplay.js の usesBoardView() に集約してある
-- ------------------------------------------------------------

alter table public.problems
  add column if not exists board_view boolean not null default false;

comment on column public.problems.board_view is
  '麻雀卓の形で出題するか。false は従来表示（手牌＋他家の捨て牌を縦に並べる）';


-- ============================================================
-- 検証（実行後に確認する）
-- ============================================================

-- (1) id の default がシーケンスになっているか
--     column_default が nextval('problems_id_seq'::regclass) になること
--
-- select column_name, column_default, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'problems' and column_name = 'id';

-- (2) 次に採番される値が「最大 id + 1」か
--     last_value が最大 id + 1、is_called が false になること
--
-- select last_value, is_called from public.problems_id_seq;
-- select max(id) from public.problems;

-- (3) シーケンスの権限（authenticated に USAGE があること）
--
-- select grantee, privilege_type
--   from information_schema.role_usage_grants
--  where object_name = 'problems_id_seq';

-- (4) board_view 列が入ったか（既存行がすべて false であること）
--
-- select board_view, count(*) from public.problems group by board_view;
