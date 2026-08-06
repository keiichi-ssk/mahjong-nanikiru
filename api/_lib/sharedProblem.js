// 共有された自作問題を「共有トークン」から取り出す／回答を集計する。
// api/shared-problem.js（本体）・api/share-q.js（中継ページ）・api/og-problem.js（カード画像）・
// api/answer.js（集計）が使う。
//
// ★★ このファイルはサーバー専用。src/ 側から import しないこと ★★
//   サービスロールキーを使うので、ブラウザに渡るコードに混ぜると鍵が漏れる。
//   `_lib` に置いているのは、Vercel が **アンダースコア始まりをエンドポイントとして公開しない**ため。
//
// なぜ RLS ではなくサービスロールキーなのか:
//   やりたいのは「トークンを知っている人だけがその1問を読める」。これを RLS で書くと
//   「共有中なら anon も読める」という形になり、**条件を工夫すれば共有中の問題を列挙できてしまう**。
//   RLS は「この行を読んでよいか」しか判定できず、リクエストの中身に応じた制御が苦手なので、
//   user_problems の RLS は閉じたまま、ここで「トークン一致の1行・必要な列だけ」を返している。

import { fromUserDb } from '../../src/utils/userProblemMapper.js';
import { sbFetch, describeFailure } from './supabase.js';

// share_token は uuid。形式を確かめてから問い合わせる（不正な文字列でDBを叩かない）
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 共有相手に渡す列。**user_id を含めないこと**（誰が作ったかは渡さない）。
// ★ answer_tally も含めない —— 回答する前に「みんなの答え」がブラウザへ届いてしまい、
//   画面で隠しても開発者ツールで見えてしまう（集計は api/answer.js が回答と引き換えに返す）。
// ★ question_image_url も含めない（2026-08-06）——
//   問題画像は限定公開バケットにあり、未ログインの閲覧者は署名付きURLを作れないので
//   そもそも表示できない。それ以上に、**画像付き問題を共有しても画像は公開しない**のが
//   決めた仕様（書籍由来の画像をインターネットに出さないため）。列ごと渡さないことで、
//   共有先に画像のファイル名すら知らせない
// ⚠ 列を足すときは user_problems に実在することを確認する。存在しない列名を書くと
//   PostgREST が 400 を返し、共有ページが丸ごと開けなくなる
const COLUMNS = [
  'id', 'title', 'display_no', 'category_id',
  'tiles', 'answer', 'dora', 'riichi', 'explanation', 'disabled', 'melds',
  'problem_type', 'discarded_tile', 'naki_choices',
  'bakaze', 'kyoku', 'honba', 'jikaze', 'junme', 'note', 'other_discard', 'scores',
].join(',');

export function isShareToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/**
 * トークンに対応する問題を取りに行き、{ problem, reason } を返す。
 *
 * reason は失敗した理由（成功時は null）。**api/ はローカルで動かせないので、
 * 本番で切り分けるにはこれしか手がかりがない**。値そのものは漏らさず、
 * どの段階で止まったかだけを返す:
 *   invalid-token  … トークンの形式が uuid ではない
 *   not-configured … 環境変数が未設定
 *   fetch-failed   … 通信に失敗した
 *   upstream-403   … GRANT 不足（RLS で弾かれる場合は 0 件の正常応答になる）
 *   upstream-401   … 鍵が無効、または送り方が形式に合っていない
 *   no-row         … 接続はできたが、そのトークンの行が無い
 */
export async function fetchSharedProblemResult(token) {
  if (!isShareToken(token)) return { problem: null, reason: 'invalid-token' };

  const { status, body } = await sbFetch(
    `/rest/v1/user_problems?share_token=eq.${token}&select=${COLUMNS}&limit=1`,
  );
  if (status !== 200) return { problem: null, reason: describeFailure(status) };
  if (!Array.isArray(body) || body.length === 0) return { problem: null, reason: 'no-row' };

  // ★★ isUserProblem を必ず付けること（2026-08-04）★★
  //   これが無いと出題側が公式問題とみなし、**スーツ置換されて牌姿が変わってしまう**
  //   （判定は problemDisplay.js の usesSuitRemap / usesBoardView が isUserProblem で行う）。
  //   自作問題を置換しないのは「実戦の局面を切り取って議論する」ためで、共有と一体の仕様。
  //   ?p= 方式の decodeProblemParam も同じ理由で付けている（problemShare.js）
  return { problem: { ...fromUserDb(body[0]), isUserProblem: true }, reason: null };
}

/** 問題だけが欲しい呼び出し向け（中継ページ・カード画像）。無ければ null。 */
export async function fetchSharedProblem(token) {
  return (await fetchSharedProblemResult(token)).problem;
}

/**
 * 回答を1件足して、更新後の集計を返す（{ tally, reason }）。
 *
 * ★ 加算は Postgres 側の関数 bump_answer_tally が1文で行う。
 *   「読んで＋1して書き戻す」をここでやると、同時に回答されたぶんを数え落とす。
 * ★ version（問題の骨格のハッシュ）が保存済みのものと違えば、関数側が集計を作り直す。
 *   ＝ 作者が手牌を変えたら自動でリセットされ、解説だけ直したときは引き継がれる。
 */
export async function bumpAnswerTally(token, version, answer) {
  if (!isShareToken(token)) return { tally: null, reason: 'invalid-token' };

  const { status, body } = await sbFetch('/rest/v1/rpc/bump_answer_tally', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token, p_version: version, p_answer: answer }),
  });
  if (status !== 200) return { tally: null, reason: describeFailure(status) };
  // 対象の行が無ければ関数は null を返す
  if (body === null) return { tally: null, reason: 'no-row' };
  return { tally: body, reason: null };
}

/**
 * 集計だけを読む（既に回答済みの人が開き直したとき用。カウントしない）。
 * 保存されている version が渡されたものと違えば、その集計は別の問題のものなので空を返す。
 */
export async function fetchAnswerTally(token, version) {
  if (!isShareToken(token)) return { tally: null, reason: 'invalid-token' };

  const { status, body } = await sbFetch(
    `/rest/v1/user_problems?share_token=eq.${token}&select=answer_tally,answer_version&limit=1`,
  );
  if (status !== 200) return { tally: null, reason: describeFailure(status) };
  if (!Array.isArray(body) || body.length === 0) return { tally: null, reason: 'no-row' };

  const row = body[0];
  if (row.answer_version !== version) return { tally: {}, reason: null };
  return { tally: row.answer_tally ?? {}, reason: null };
}
