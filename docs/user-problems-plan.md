# 自作問題集（my問題集）＋ 雀魂牌譜インポート 実装計画

作成日: 2026-07-28 / 最終更新: 2026-07-28
ステータス: **Phase 1〜4 実装済み（作成・出題・正誤記録＋盤面インポート層）／ Phase 5 未着手**

> 実装済みぶんの要点は `CLAUDE.md` の「自作問題集（my問題集）」「盤面インポート層」の節にまとめてある。
> このファイルは**未着手ぶん（Phase 5）の設計と、そこに至る判断の記録**として読むこと。

## 1. ゴール

ユーザーが自分で任意の局面を盤面として作り、正解を自分で設定し、**カテゴリに分けて保存**して、
**自分専用の問題集として出題・回答できる**ようにする。
局面の入力手段のひとつとして、雀魂の牌譜から盤面を再現できるようにする。

### 当面のスコープ（2026-07-28 決定）

- **利用者はスーパー管理者（ささき）のみ**。使用感を確かめてから開放を判断する
- **自作問題は本人だけが見える**（共有・公開はしない。当面その予定もなし）
- **問題の作成は専用の別HTML**（`chinitsu.html` と同じ独立エントリ方式）。**本番ビルドに含める**
- **出題・回答は本体アプリ**（`index.html`）で行う
- **カテゴリはユーザーが自由に作れる。階層は1段**（大分類は設けない）
- **自作問題への画像添付は無効**にする（6-5）
- **牌譜の取り込みは「ユーザーがJSONファイルを持ち込む」方式に確定**（8章。URL入力方式は不採用）

---

## 2. 全体像 — 5段階に分解する

| # | 機能 | 状態 | 依存 | 規模 | 備考 |
|---|---|---|---|---|---|
| 1 | `user_problems` / `user_categories` テーブル + RLS | ✅ 完了 | — | 小 | DB作業が中心 |
| 2 | **作成画面（新HTML）** | ✅ 完了 | 1 | 中 | エディタ＋カテゴリ管理 |
| 3 | **本体アプリへの出題統合** | ✅ 完了 | 1 | 中 | 既存の出題フローに自作問題を混ぜる |
| 4 | 盤面インポート層（`importBoard.js`） | ✅ 完了 | 2 | 小 | 純粋関数・テスト容易 |
| 5 | 雀魂牌譜の取り込み | **未着手** | 4 | **大** | 局面選択UIが必要 |

**1→2→3 の時点で「自分専用問題集」は機能として完結する。**
インポート層と牌譜は入力を楽にする手段にすぎないので、後で構わない。

### 別HTML化で軽くなった点 ✅

当初は「エディタを本体アプリへ移設」する計画で、**`admin.css`（2559行）の分離が最大コスト**だった。
別エントリにすることで以下が**すべて不要**になった:

- CSS の切り出し・統合作業（新HTMLから `admin.css` をそのまま読める）
- バンドル肥大への対処（`React.lazy` による遅延ロードの工夫）
- 本体アプリのビルド構成への影響

→ **旧 Phase 2 は「大」から「中」へ。** 代わりに本体側の出題統合（新 Phase 3）が増えた。

---

## 3. 現状コードの前提（調査結果）

計画の土台になる事実。**ここが変わると計画も変わる。**

### 3-1. `ProblemEditor` は保存処理を持っていない ✅ 好都合

`ProblemEditor.jsx`（1377行）は `onSave(buildSaveData())` を呼ぶだけで、
実際の Supabase 書き込みは親の `AdminApp.handleSave` が持っている。

Supabase への直接依存は**画像アップロード/削除の2箇所だけ**
（[ProblemEditor.jsx:295](../src/admin/ProblemEditor.jsx#L295), [:310](../src/admin/ProblemEditor.jsx#L310)）。

→ **保存先を差し替えるだけで `user_problems` に流せる。** エディタ本体の改造はほぼ不要。

### 3-2. `ProblemView` は problem オブジェクトを受け取るだけ ✅ 好都合

出題側（790行）は problem の形さえ同じなら中身の出所を問わない。
→ **自作問題も同じ形にすれば、出題そのものは無改造で動く。**

### 3-3. `user_results.problem_id` は `problems.id` への FK ⚠️ 要対処

[CLAUDE.md](../CLAUDE.md) 記載のとおり `ON DELETE CASCADE` が前提。
**自作問題の正誤記録をこのテーブルに混ぜると FK 違反になる。**（→ 4-3 で対処）

### 3-4. `section` の解決はすべて `categories.json` の索引を通る ⚠️ Phase 3 の要点

`section` は `categories.json` のIDを指す**数値文字列**（`"1"`, `"25"`）。
解決の入口は [categoryUtils.js:9-11](../src/utils/categoryUtils.js#L9-L11) の**1関数だけ**:

```js
function getCategory(section) {
  return CATEGORY_INDEX[parseInt(section, 10)];   // categories.json の索引
}
```

`categories.json` に無いIDは `undefined` が返り、各関数がフォールバック値を返す。
**例外は投げない＝静かに壊れる。**

出題側での使用箇所:

| 箇所 | コード | 役割 |
|---|---|---|
| [App.jsx:280](../src/App.jsx#L280) | `isSectionAllowed(allowed, p.section)` | 権限フィルタ |
| [App.jsx:283](../src/App.jsx#L283) | `[...new Set(...)].sort((a,b) => parseInt(a) - parseInt(b))` | カテゴリ一覧の生成 |
| [App.jsx:288](../src/App.jsx#L288) | `sections.has(p.section)` | 出題対象の抽出 |
| [CategoryList.jsx:164](../src/components/CategoryList.jsx#L164) | `groupByBook(categories)` | **書籍→大分類→カテゴリの振り分け** |
| [CategoryList.jsx:144](../src/components/CategoryList.jsx#L144) | `sectionLabel(cat)` | カテゴリ名の表示 |

→ 自作カテゴリをここに混ぜる方法を決める必要がある（→ 6-2）。

### 3-5. `admin.html` の管理画面は触らない

公式問題の編集画面（`AdminApp`）は現状のまま。
自作問題の作成画面は**別物として新設**し、`ProblemEditor` / `BoardView` を**共有して使う**。

---

## 4. Phase 1 — DB スキーマ

### 4-1. なぜ既存 `problems` に混ぜないか

既存 `problems` の RLS は「**書き込みは管理者のみ**（`public.is_admin()`）」。
ここにユーザー書き込みを許すと権限体系が破綻する。
**必ず別テーブルにする。**

### 4-2. `user_categories`（カテゴリ・1階層）

```sql
create table public.user_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,   -- 表示順（ドラッグ並べ替え用）
  created_at timestamptz not null default now()
);

alter table public.user_categories enable row level security;

create policy "own rows" on public.user_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ★ GRANT を忘れない（CLAUDE.md の教訓。無いと 403）
grant select, insert, update, delete on public.user_categories to authenticated;
```

**カテゴリを text 列ではなく専用テーブルにする理由:** 並び順の制御・一括リネーム・
問題が0件のカテゴリの保持ができるため。「管理画面のようにカテゴリ分けしたい」という
要望にはカテゴリ管理UI（追加・リネーム・並べ替え・削除）が含まれると解釈した。

### 4-3. `user_problems`（問題本体）

`problems` と同じ列を持たせ、`toDb`/`fromDb` をそのまま流用できる形にする。

```sql
create table public.user_problems (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid references public.user_categories(id) on delete set null,
  title        text not null default '',   -- 一覧での見出し
  sort_order   int  not null default 0,    -- カテゴリ内の並び順
  -- 以下は problems と同じ（problemMapper をそのまま使うため列名を揃える）
  tiles        jsonb not null default '[]',
  answer       text  not null default '',
  dora         text  not null default '',
  riichi       boolean,
  explanation  text  not null default '',
  melds        jsonb not null default '[]',
  problem_type text  not null default 'default',
  discarded_tile text,
  naki_choices jsonb not null default '[]',
  bakaze       text,
  kyoku        int,
  honba        int,
  jikaze       text,
  junme        int,
  note         text not null default '',
  other_discard jsonb,
  scores       jsonb,
  -- 自作問題ならではの列
  source       text,          -- 'manual' | 'paifu' など入力元の記録
  source_ref   text,          -- 牌譜の局面参照（uuid + 局 + 巡目など）
  correct      boolean,       -- ★ 正誤記録をこの行自体に持つ（下記参照）
  answered_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.user_problems enable row level security;

create policy "own rows" on public.user_problems
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.user_problems to authenticated;
```

**正誤記録は `user_results` に混ぜず、`user_problems` 行自体の `correct` 列に持たせる。**
理由: `user_results.problem_id` は `problems.id` への FK（3-3）で uuid を入れられない。
自作問題は 1ユーザー1行なので、別テーブルを作るより行に持たせるほうが単純。

### 4-4. ID が uuid になることの影響 ⚠️ 要検証

既存の problem.id は数値。自作問題を uuid にすると以下に影響しうる。

- `results[p.id]` … オブジェクトキーなので文字列化される。**問題なし**
- `roundStorage` の `orderedIds` … JSON 保存なので型は保たれる。**問題なし**
- `collectPendingUpgrades` … `String(p.id)` 比較。**問題なし**
- **`problems` と `user_problems` の id が衝突しないこと** … 数値 vs uuid なので衝突しない ✅

→ 論理的には動くが、**Phase 3 の完了条件に「uuid の問題を1問出題して通す」を入れる。**

---

## 5. Phase 2 — 作成画面（新HTML）

### 5-1. 構成（`chinitsu.html` の前例に倣う）

| 項目 | 内容 |
|---|---|
| HTML | `myproblems.html`（名前は要決定・11章） |
| エントリ | `src/myproblems.jsx` |
| ルート | `src/myproblems/MyProblemsApp.jsx` |
| 流用 | `admin/ProblemEditor.jsx`・`admin/BoardView.jsx`・`admin/admin.css` |
| ビルド | `vite.config.js` の `input` に**追加する**（本番に含める） |

**`chinitsu.html` とは異なり Supabase を使う**（認証と保存が必要なため）。
`chinitsu.jsx` の「Supabase を絶対に import しない」制約は**この新HTMLには適用されない**。

### 5-2. 画面に必要なもの

- ログイン（Google OAuth・本体と同じセッションを共有）
- **カテゴリ管理**: 追加・リネーム・並べ替え・削除
- **問題一覧**: カテゴリごと。選択で編集へ
- **エディタ**: `ProblemEditor` をそのまま使う（保存先だけ `user_problems` に差し替え）
- 新規作成・削除

並べ替えUIを作る場合は **`utils/useDragReorder.js` を使うこと**（CLAUDE.md の方針）。

### 5-3. 本番公開時のアクセス制御 ⚠️

`admin.html` を本番ビルドから外しているのは「管理者用UIを本番に出さない」という設計。
新HTMLは**それとは別物**として扱う:

- **実効防御は RLS**。本人の行しか読み書きできないため、URLを知られても他人のデータには触れない
- **当面は `allowed_users.is_admin` でUIゲート**する（利用者はささきさんのみのため）
- 将来開放するときはこのゲートを外すだけでよい

### 5-4. `ProblemEditor` に必要な改修（最小限）

| 改修 | 内容 |
|---|---|
| 保存先 | 親が `onSave` を受け取る形なので**改修不要**。新HTML側で `user_problems` に書く |
| 画像添付 | prop で無効化できるようにする（→ 6-5） |
| 「修正済み」フラグ | 自作問題では不要。prop で隠す |
| カテゴリ選択 | 追加が必要（既存は `section` を数値で持つため） |

### 5-5. 画像アップロード（`question-images` バケット）は無効にする

現在のバケットの RLS は「書き込みは管理者のみ」。
自作問題で使わせるならポリシー追加が必要になるため、**初期スコープでは無効**にする
（`ProblemEditor` に prop を足して隠す）。牌譜から盤面を作るのが目的なので画像は無くても成立する。

---

## 6. Phase 3 — 本体アプリへの出題統合

**出題・回答は本体（`index.html`）で行う**ため、`App.jsx` 側に改修が必要。

### 6-1. 問題の取得とマージ

現状 [App.jsx:268](../src/App.jsx#L268) は `problems` だけを取得している。
ここに `user_problems` の取得を足し、`fromDb` を通して**同じ形の配列に混ぜる**。

自作問題には判別用のフラグを持たせる（例 `isUserProblem: true`）。
正誤記録の書き込み先の分岐（6-3）に使う。

### 6-2. section（カテゴリ）の扱い ⚠️ 設計の要点

自作カテゴリの uuid を `section` にそのまま入れると、**エラーを出さずに静かに壊れる**（3-4）。
2026-07-28 の調査で確認した具体的な壊れ方（深刻な順）:

| # | 壊れ方 | 原因 |
|---|---|---|
| **①** | **画面にまったく表示されない** ← 本命 | [groupByBook](../src/utils/categoryUtils.js#L86-L96) が `categoryIds.includes(sectionNumber(c))` で絞るため、`NaN` はどの `majorGroup` にも入らない。`CategoryList` はこの結果だけを描画する |
| ② | 権限フィルタで全滅 | `isSectionAllowed` は `if (!c) return false`。**`allowed_major_categories` が設定されたユーザーだけで起きる**＝開発中は表面化しない |
| ③ | ソート順が不定 | `parseInt('u:xxx')` が `NaN`。比較関数が `NaN` を返すとソート結果は実装依存 |
| ④ | カテゴリ名が生の文字列で出る | `sectionLabel` が `?? String(section)` で uuid をそのまま返す |
| ⑤ | 「その他」書籍に分類される | `getBookLabel` / `getMajorCategory` のフォールバック |

**①で表示されないため、②〜⑤には実際には到達しない。** 対処の本丸は①。

### 対処方針

**`section` に接頭辞を付けて名前空間を分ける**（例 `u:<category_id>`）うえで、
**`CategoryList` に「my問題集」書籍タブを明示的に追加する**。
`groupByBook` の戻り値に、`user_categories` から組み立てた book を1つ足す形にする。

```
groupByBook(categories)  →  [書籍A, 書籍B, ...]
                            + { label: 'my問題集',
                                majorGroups: [{ label: '', sections: [u:xxx, u:yyy] }] }
```

あわせて分岐が要る箇所:

| 箇所 | 分岐内容 |
|---|---|
| カテゴリのソート | `u:` 付きは `parseInt` を使わず `user_categories.sort_order` で並べる |
| カテゴリ名の解決 | `categories.json` ではなく `user_categories.name` から引く |
| `isSectionAllowed` | **`u:` 付きは常に許可**（本人の問題のため権限判定の対象外） |

**この分岐を `App.jsx` や `CategoryList.jsx` に直接書かず、`categoryUtils.js` に純粋関数として置く**
（判定ロジックを分離する CLAUDE.md の方針に従う。テストで固定すること）。

**先例:** 管理画面には既に同じ問題への救済がある
（[AdminApp.jsx:156-161](../src/admin/AdminApp.jsx#L156-L161)。`categories.json` に無い section を
「その他 › 未分類」に逃がす処理）。**`CategoryList` にはこれが無い**ので、
本体側は新規に対応が要る。

### 6-3. 正誤記録の分岐

[App.jsx:180](../src/App.jsx#L180) の `handleAnswer` は `user_results` に upsert している。
自作問題は `user_problems.correct` を更新する形に分岐させる。

`handleResetResults` / `handleConfirmUpgrades` も同様に分岐が要る。
**分岐が3箇所に散るので、保存先を吸収する薄い関数を1つ作ってそこに集約する。**

### 6-4. 作成画面への導線

本体のカテゴリ一覧から新HTMLへ `<a href="/myproblems.html">` で飛ばす。
**別タブで開く**（`target="_blank" rel="noopener"`）。ドリルへの導線と同じ理由で、
本体の再読み込み（セッション復元と全問取得）を避けるため。

---

## 7. Phase 4 — 盤面インポート層 ✅ 完了（2026-07-28）

**実装したもの:** `src/utils/importBoard.js` + `importBoard.test.js`（28件）。
仕様と禁止事項は `CLAUDE.md` の「盤面インポート層」の節に形式知化済み。**新セッションではそちらを読むこと。**

着手時に判明した点と、それを受けた決定:

| # | 内容 |
|---|---|
| 1 | **牌姿テキストの解析は既に存在した**（`ProblemEditor.jsx` の private 関数 `parseTilesText`＝手牌タブの「テキスト一括入力」）。7-3 が「まず対応する」としていた入力元は、手牌に限れば実装済みだった。そこで**新規に書かず `importBoard.js` へ移設して共通化**し、`ProblemEditor` はそれを import する形にした |
| 2 | 移設にあわせて**存在しない牌（`0z` / `8z` / `9z`）を捨てる**ようにした（従来は素通りし、牌画像を持たない牌が手牌に入り得た） |
| 3 | **副露の `from` は BoardSnapshot では絶対風、problem では相対位置**（牌譜から取れるのが絶対風のため）。変換は既存の `relativeWind()` に任せた |
| 4 | **自分の副露を `otherDiscards` の自分ブロックに入れてはいけない**ことが分かった（`collectCalledTiles` が鳴かれた牌を二重に数える）。`snapshotToProblem` は自分ブロックの副露を空にする |
| 5 | **UI は追加していない**（盤面テキスト記法の新設は見送り・下記 7-4）。この層は Phase 5 の局面選択UIから呼ばれる前提 |

### 7-4. 盤面テキスト記法を作らなかった理由（2026-07-28 判断）

手牌に加えて副露・状況・他家の河までテキストで貼れる記法を新設する案は**採らなかった**。
記法を覚える必要があるうえ、盤面UIで直接入れるより速いとは限らないため。
本命は牌譜からの取り込み（Phase 5）で、そこでは記法を経由しない。
**将来ほしくなったときは、この層に「テキスト → BoardSnapshot」のアダプタを1つ足すだけでよい**
（`snapshotFromHandText` がその位置に置いてある）。

### 7-1. 設計方針

`src/utils/importBoard.js` を新設。**DB非依存の純粋関数**にしてテストで固定する
（`chinitsuUtils.js` / `boardUtils.js` と同じ扱い）。

```
外部データ（牌譜 / 牌姿テキスト）
      ↓  各アダプタ
  中間形式（BoardSnapshot）
      ↓  importBoard.js
  problem オブジェクト（既存の形）
      ↓
  ProblemEditor で正解を設定 → 保存
```

### 7-2. 中間形式（BoardSnapshot）を定める理由

入力元ごとに変換を書くと、入力元が増えるたびに problem 生成ロジックが重複する。
**中間形式を1つ決めて、入力元ごとにアダプタだけ差し替える。**

BoardSnapshot に持たせる情報:
`bakaze` / `kyoku` / `honba` / `junme` / `jikaze` / `dora` /
各家の `hand` `melds` `discards` `riichiIndex` / `scores` / `kyotaku`

### 7-3. まず対応する入力元

**牌姿テキスト**（例 `123456789m1122z` + 状況）。
一番軽く、Phase 5 を待たずにインポート層の設計を検証できる。

---

## 8. Phase 5 — 雀魂牌譜の取り込み（方式確定）

**方式: ユーザーが自分で取得した牌譜JSONファイルをアプリに読み込ませる**（2026-07-28 決定）。

### 8-1. 「牌譜URLを入力させサーバー側で取得」を採らない理由

技術的に成立せず、かつ**同じ方式が実際に潰された前例がある**ため。
以下は 2026-07-28 の検証で確認した事実。**再検討する際はここを読むこと。**

mjai-reviewer 公式ドキュメント（[mjsoul.adoc](https://github.com/Equim-chan/mjai-reviewer/blob/master/mjsoul.adoc)）より:

- 雀魂の牌譜取得には**ログイン認証が必須**
- 取得手段は **Tampermonkey のユーザースクリプト**（`downloadlogs`）で、**ユーザー自身のブラウザ**で行う
- 内部APIは `Lobby.fetchGameRecord` を `app.NetAgent.sendReq2Lobby` 経由で呼ぶ。
  **`app.NetAgent` はゲームクライアントのJSオブジェクトで、サーバーからは呼べない**
- かつて **`tensoul`** が heroku 上でログイン自動化を提供していたが、
  **雀魂側に規制され、ログイン時のエラーコード151で利用不可**になった
  ← **これが「URL入力→サーバー取得」方式そのものの前例**
- 同ドキュメントは**サブアカウント利用を強く推奨**（＝BANリスクを前提とした運用）

[雀魂API解析Wiki](https://wikiwiki.jp/majsoul-api/%E7%89%8C%E8%AD%9C%E3%82%92%E3%83%95%E3%82%A4%E3%83%AB%E3%81%AB%E4%BF%9D%E5%AD%98%E3%81%99%E3%82%8B%E3%81%AB%E3%82%83) も
「短時間の大量ダウンロードはサーバーから攻撃と見なされ、アカウントが永久停止される」と警告している。

**天鳳と雀魂は同列に見えて実装が別物**（ツール類が「牌譜URL (天鳳、雀魂)」と並記するため誤解しやすい）:

| | 牌譜の取得 |
|---|---|
| 天鳳 | **公開URL**で誰でも取得可能 → サーバーから普通に取れる |
| 雀魂 | lobby への**認証済みWebSocket接続が必須** → **サーバーからは取れない** |

### 8-1b. 再調査（2026-07-28）— 取得スクリプトが世代交代している ⚠️

8-1 の結論（**サーバー側からは取れない・JSONファイル持ち込み方式**）は変わらず有効。
ただし**ブラウザ内スクリプトの実装方式が入れ替わっている**ことが分かった。

| | 旧方式 | 現行方式 |
|---|---|---|
| 仕組み | ゲームクライアントの `app.NetAgent.sendReq2Lobby` 経由で `Lobby.fetchGameRecord` を呼ぶ | **`window.WebSocket` をページ読み込み時にフックし、`fetchGameRecord` のレスポンスを横取りする** |
| 代表 | `downloadlogs.js`（Gist。[雀魂API解析Wiki](https://wikiwiki.jp/majsoul-api/%E7%89%8C%E8%AD%9C%E3%82%92%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB%E3%81%AB%E4%BF%9D%E5%AD%98%E3%81%99%E3%82%8B%E3%81%AB%E3%82%83) の手順。**最終更新 2024年4月**） | [Majsoul-to-NAGA](https://github.com/honvl/Majsoul-to-NAGA)（2026年に WebSocket キャプチャ＋protobuf デコーダへ移行） |

- Majsoul-to-NAGA が「かつてのゲームマネージャーのグローバル呼び出しに**代わる**実装」と明記している
  ＝ **旧 `downloadlogs.js` は現在の雀魂では動かない可能性が高い**
- **⚠️ 2026-07-28: ユーザーが Wiki\* の手順を実際に試して失敗した。旧方式は使えないと考えてよい**
- Majsoul-to-NAGA 自体は**ローカルへのJSON保存機能を持たず**、NAGA へ直接送信するだけ（NAGA は局ごとに課金）。
  そのままでは使えない。使えるのは「WebSocket フック方式が現行」という知見の部分だけ
- リスクの記載は 8-1 から変わらず（**短時間の大量DLで永久停止**・**サブアカウント推奨**）

### 8-1c. 取得手段を確保した — 天鳳形式で保存する（2026-07-28）

[honvl/Majsoul-to-NAGA](https://github.com/honvl/Majsoul-to-NAGA)（**MIT・最終更新 2026-06-08**）の
`downloadlogsnaga.js` が、**WebSocket フックで牌譜を捕まえ、protobuf を自前デコードして
天鳳形式（tenhou.net/6）に変換する**ところまでを内蔵していた。
NAGA への送信はその**後**なので、送信部分だけをローカル保存に差し替えれば目的を果たせる。

**→ 改変版を `tools-local/majsoul-save-tenhou.user.js` に置いた**（Tampermonkey に登録して使う）。

- **`tools-local/` は `.gitignore` 済み**。規約上グレーな外部ツールの改変物なので公開リポジトリには含めない（9章）
- 改変したのは末尾の出力部分だけ（`saveJson` / `buildFilename` を追加し、NAGA 送信系の関数を削除）。
  **WebSocket フック・protobuf デコーダ・天鳳形式への変換はオリジナルのまま**なので、
  雀魂側の仕様変更で壊れたときは**本家の更新を取り込んで同じ差し替えをやり直す**のが早い
- 変換結果を `https://tenhou.net/6/#json=...` で天鳳のビューアに流すログも出る（変換の正しさを目視確認できる）

#### 入力形式は天鳳形式（tenhou.net/6）に決定

| 案 | 手順 | 安定性 | 汎用性 |
|---|---|---|---|
| 雀魂の生JSON | 1ステップ | ✗ 仕様非公開でゲーム更新に弱い | 雀魂のみ |
| mjai 形式 | 変換ツールを別途通す | ○ | 天鳳も可 |
| **天鳳形式** ← 採用 | **Sキー1回（スクリプト内で変換完結）** | **○ 仕様が広く知られビューアで検証できる** | **天鳳の牌譜も同じアダプタで読める** |

**⚠️ ただし天鳳形式は「局ごとの配牌＋ツモ／打牌の列」であって盤面のスナップショットではない。**
BoardSnapshot（7-2）を作るには**局の先頭から指定の巡目まで再生する**処理が要る。
これは mjai 形式でも同じで、Phase 5 の工数の中心は 8-4 の局面選択UIとこの再生処理になる。

### 8-1d. Phase 5a 完了（2026-07-28）

**`src/utils/tenhouPaifu.js` + テスト29件**。天鳳形式 → BoardSnapshot の変換ができるようになった。
仕様と落とし穴は `CLAUDE.md` の「牌譜の取り込み」の節にまとめてある（**新セッションではそちらを読むこと**）。

- テストは**実際に取り込んだ牌譜**（`src/utils/__fixtures__/tenhou-sample.json`・対局者名だけ伏せたもの）で固定。
  上家/下家/対面からのポン・チー（赤5筒入り）・加槓・リーチ・カンドラ・供託がすべて含まれていた
- **全局・全席・全巡目（約300局面）で手牌枚数が整合すること**を一括検証している
- 実装中に踏んだ間違い: **天鳳の供託は「リーチ棒の本数」**で、このアプリの `kyotaku`（点数）とは単位が違う（1000倍が必要）
- 元の牌譜は `tools-local/paifu/` に置く（`.gitignore` 済み。対局者名を含むため）

### 8-1e. Phase 5b・5c 完了（2026-07-28）

**`src/myproblems/PaifuImport.jsx`**（my問題集の「牌譜から」ボタン）。
仕様は `CLAUDE.md` の「牌譜の取り込み」の節にまとめてある。

**当初は「局面を選ぶ専用画面 → 問題を作る → エディタ」の3段だったが、
ユーザーの要望で「牌譜を読み込んだらすぐエディタに入り、そこで席・局面を選ぶ」形に作り替えた**（同日）。

- `PaifuImport` は独立した画面ではなく、**エディタのヘッダー行に差し込むナビ**になった
- **保存で初めて `user_problems` に insert される**（読み込んだ時点では作らない）。
  正解が未設定の問題が溜まらず、保存後もドラフトが残るので続けて何問でも切り出せる
- 局面を変えたら `key` でエディタを作り直す（手牌が変わる以上、入力中の正解は引き継げない）
- 実戦の打牌を参考として表示するが、**正解としては入れない**（8-6 の方針どおり人が決める）
- 実装中に見つけた注意点: **`BoardView` は表示だけの用途でも `onSelectArea` が必須**
  （渡さないと盤面クリックで落ちる）。`CLAUDE.md` に記載済み

### 8-1f. ツモ番以外の局面にも対応（2026-07-28）

当初の実装は「自分が打牌する直前」しか切り出せず、**鳴くか・押すかを問う局面が作れなかった**
（`naki-timing` / `naki-choice` の問題タイプがあるのに使えない）。
ユーザーの指摘を受けて、**局を「ステップ（局面）の列」として扱う**形に作り替えた。

- 再生を `replayAll()` に一本化し、`listSteps` / `snapshotAt` / `replayRound` はその結果を読むだけにした。
  **既存テスト29件がそのまま通ったことが、載せ替えの検証になっている**
- **視点（`seat`）とステップは独立**。「南家が切った瞬間を東家の視点で見る」が指定できる
- `BoardSnapshot` に `lastDiscard` を足し、`snapshotToProblem` が `problem.discardedTile` に変換する。
  **問題タイプは自動で決めない**（他家の打牌直後は「鳴く」「オリる」など複数の可能性があるため人が選ぶ）
- 画面のナビは1手ずつのステップ送り＋絞り込み（自分の手番／他家の打牌／すべて）。
  既定は「自分の手番」なので、それまでの操作感は変わらない

あわせて同日、ユーザーの要望で次の2点を入れた（詳細は `CLAUDE.md`）:

1. **他家の手牌をツモ直後は14枚で表示する**（`BoardView` の `concealedCounts`）。
   盤面は「13 − 3×副露数」で描いていたため、他家のツモ直後も13枚に見えていた
2. **牌譜モードでは盤面をロックし、それを既定にした**（`ProblemEditor` の `lockBoard`）。
   **「実在の局面から問題を作るのが基本、状況や手牌を変えるのはオプション」というユーザーの思想による。**
   ヘッダーの「盤面を編集」トグルで解除でき、局面を切り替えるとロックに戻る

### 8-2. 実装方針

```
ユーザーが取得済みの牌譜JSON
      ↓  ドラッグ&ドロップ / ファイル選択
  パース（フォーマット別アダプタ）
      ↓
  BoardSnapshot（7-2 の中間形式）
      ↓  局面選択UI（8-4）
  importBoard.js → problem オブジェクト
      ↓
  ProblemEditor で正解を設定 → 保存
```

**アプリは雀魂サーバーに一切アクセスしない。** これが本方式の要点。

牌譜JSONには盤面の完全な情報（各家の手牌・河・副露・ドラ・点数・巡目）が入っているため、
**画像認識のような精度の問題は発生しない。**

### 8-3. 守るべき制約 ⚠️

- **アプリ内に牌譜の取得手順を案内しない。**
  取得行為自体はリバースエンジニアリング産物の利用で規約上グレーであり、
  手順を案内すると規約違反を推奨する形になる。
  **「取得済みのJSONを読み込む」機能に留める**
- **他ユーザーへ開放するときは Phase 5 を無効化する。**
  BANリスクを他人に負わせないため。ささきさん個人が自分の牌譜に使うぶんには
  自己責任の範囲に収まるが、機能として提供するのは別問題
- この制約は UI 文言にも及ぶ。「雀魂の牌譜を取り込む」ではなく
  **「牌譜JSONファイルを読み込む」**のような、取得手段に踏み込まない表現にする

### 8-4. 局面選択UI が必要

牌譜には1試合ぶんの全局面が入っている。「どの局のどの巡目を問題にするか」を
選ぶには、**簡易的な牌譜再生プレイヤー**（局選択 → 巡目スライダー → 盤面プレビュー）を作ることになる。
**Phase 5 の工数の大半はここ。**

ただし新HTMLで `BoardView` を使っているので、**プレビュー描画は流用できる。**

### 8-5. 牌譜フォーマットは複数ある

mjai 形式 / 天鳳 XML 形式 / 雀魂の生 JSON など。
→ 7-2 の中間形式に変換するアダプタを**フォーマットごとに書く**。
最初は1つだけ対応し、他は後から足せる構造にする。

### 8-6. 正解の決定について

牌譜に入っているのは「実際に切った牌」であって正解ではない。
本計画では**ユーザーが自分で正解を設定する**方針なので、この点は問題にならない。

将来 AI に正解を付けさせたくなった場合は、`mjai-reviewer` / `Mortal` が
「AI推奨打牌 vs 実打」の差分（悪手検出）を出せるので、
**悪手と判定された局面＝良質な問題**として利用できる。ただし別途検討とする。

---

## 9. 規約・法務上の整理

- **自分の牌譜を、自分だけが解く問題にする**構成なので二次配布に当たらない。
  `user_problems` を RLS で本人限定にすることで、この境界がデータ構造として担保される
- **牌画像の流用は不可**。本アプリは自前 SVG（`public/tiles/`）を使うので問題なし
- **アプリ自体は雀魂サーバーに一切アクセスしない**（8-2）。
  したがってアプリ側が規約違反の主体になることはない
- **残るリスクの所在は「牌譜を取得するユーザー個人の行為」**。
  取得手段（Tampermonkey スクリプト等）はリバースエンジニアリング産物であり規約上グレーで、
  雀魂公式は外部ツール使用による**アカウント永久停止を実際に繰り返し実施**している。
  当面は利用者がささきさん本人のみなので自己責任の範囲に収まるが、
  **他ユーザーへ開放する際は Phase 5 を無効化する**（8-3）
- **自作問題を他ユーザーへ共有する機能を足すときは、この整理をやり直すこと**

---

## 10. 進め方の提案

各ステップ終了時に動作確認し、承認を得てから次へ進む。

| 順 | 内容 | 完了条件 | 状態 |
|---|---|---|---|
| 1 | Phase 1: テーブル + RLS | SQL をユーザーが SQL Editor で実行。手で1行入れて本人だけが読めることを確認 | ✅ |
| 2 | Phase 2: 新HTMLの器 | `myproblems.html` が開き、ログインできる。ビルドが通る | ✅ |
| 3 | Phase 2: カテゴリ管理 | カテゴリの追加・リネーム・並べ替え・削除ができる | ✅ |
| 4 | Phase 2: 問題の作成 | `ProblemEditor` で問題を作り、カテゴリに紐づけて保存・再編集できる | ✅ |
| 5 | Phase 3: 出題統合 | 本体アプリに「my問題集」が出る。**uuid の自作問題を1問、出題・回答・正誤記録まで通す** | ✅ |
| 6 | Phase 4: インポート層 | 牌姿テキストから盤面が再現される。`importBoard.test.js` が通る | ✅ |
| 7 | Phase 5a: 牌譜パーサ | 牌譜JSONから BoardSnapshot に変換できる。テストで固定 | ✅ |
| 8 | Phase 5b: 局面選択UI | 牌譜を読み込み、局・巡目を選んで盤面に反映 | ✅ |
| 9 | Phase 5c: my問題集への組み込み | 牌譜由来の局面に正解を設定して保存できる | ✅（5b に含めて実装） |

**各段階で `npm test` / `npm run lint` を通すこと。**
**Phase 3 の後は、既存の公式問題の出題にデグレが無いことも必ず確認する。**

---

## 10-2. 実装して分かったこと（計画時に想定していなかった点）

Phase 1〜3 の実装中に判明し、計画を修正した点。**Phase 4・5 を進めるときの前提になる。**

| # | 内容 |
|---|---|
| 1 | **`useDragReorder` は横並び専用**（`clientX` だけで挿入位置を決める）。縦のカテゴリ一覧には使えず、↑↓ボタンにした。**Phase 4・5 で縦の並べ替えUIを作るときも同じ制約がある** |
| 2 | **`ProblemEditor` のオプションは5つになった**（`hideImage` / `hideReviewed` / `hideDelete` / `headerLead` / `saveStatus`）。削除ボタンを隠したのは、uuid だと確認メッセージが不自然で「全ユーザーの正誤記録も削除されます」の文言も誤りになるため |
| 3 | **表示用の連番 `display_no` を追加した**（計画時に無かった）。uuid は画面に出せないため。**採番はDBのトリガー**（アプリ側の `max+1` は同時作成で重複する） |
| 4 | `user_problems` には `question_image_url` と `disabled` も持たせた。前者は将来の画像対応用（UIは隠したまま）、後者は出題側の `filter(p => !p.disabled)` と揃えるため |
| 5 | **`handleConfirmUpgrades` に `problemIds.map(Number)` があり、uuid を渡すと `NaN` になる不具合があった**（既存コード）。Phase 3 で修正済み |
| 6 | 保存結果の表示はサイドバーではなく**保存ボタンの隣**に出す（遠いと保存できたか分からない）。成功は2.5秒で自動的に消し、失敗は消さない |

## 11. 決定事項と残る未決事項

### 決定済み（2026-07-28）

| 項目 | 決定 | 参照 |
|---|---|---|
| 利用者の範囲 | ささきさん専用でまず試す（`is_admin` でゲート） | 1 / 5-3 |
| 問題の作成場所 | **専用の別HTML**（`chinitsu.html` と同じ独立エントリ） | 5 |
| 出題・回答の場所 | **本体アプリ**（`index.html`） | 6 |
| 本番公開 | **含める**（`vite.config.js` の input に追加） | 5-1 |
| カテゴリ | **ユーザーが自由に作れる・1階層**（`user_categories` テーブル） | 4-2 |
| 自作問題への画像添付 | 無効にする | 5-5 |
| 他ユーザーへの共有機能 | 現時点で予定なし | 9 |
| 牌譜の取り込み方式 | **JSONファイルの持ち込み**（URL入力方式は不採用） | 8-1 |

### 残る未決事項（各Phase着手時に決める）

1. **新HTMLのファイル名** … `myproblems.html` を仮置き。`mypro.html` / `create.html` なども可
2. **`section` の接頭辞の書式** … 6-2 の `u:<uuid>` は仮。実装時に確定する
3. **`user_problems.title` の扱い** … 自動生成（「東1局 9巡目」等）にするか、手入力必須にするか
4. ~~牌譜フォーマットのどれに最初に対応するか~~ … **決定: 天鳳形式（tenhou.net/6）**（2026-07-28・8-1c）。
   取得手段（`tools-local/majsoul-save-tenhou.user.js`）も確保済み。**実機での動作確認は未**
