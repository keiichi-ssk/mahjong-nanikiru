// 問題の「骨格」から集計用のバージョン文字列を作る（純粋関数・DOM/DB 非依存）。
//
// 何のためにあるか:
//   共有した問題は作者があとから編集できる。手牌やドラが変わったら、それ以前に集まった
//   「みんなの選択」はもう別の問題への回答なので、混ぜてはいけない。
//   一方で **解説の誤字を直しただけで集計が消えるのは困る**。
//   そこで「牌姿と状況」だけからバージョンを作り、これが変わったときだけ集計をリセットする。
//
//   含めるもの   … 手牌・副露・ドラ・問題タイプ・打牌/鳴き候補・場風/局/本場/自風/巡目・
//                  他家の捨て牌・点数（＝どれか変われば「違う問題」になるもの）
//   含めないもの … 解説・注釈・タイトル・正解・リーチ設定・カテゴリ
//                  （直しても同じ問題への回答として数え続けたいもの）
//
// ★★ 計算方法を変えると、それまでに集めた集計と繋がらなくなる ★★
//   フィールドを1つ足しただけで全問のバージョンが変わり、集計が全部リセットされる。
//   problemKey.test.js のゴールデンテストが変更を検知するので、**テストが落ちたら
//   「本当に全部リセットしてよいか」を必ず判断すること**（安易にテストを書き換えない）。

// キーの並び順を固定するため、JSON.stringify にオブジェクトをそのまま渡さず配列で組む
// （オブジェクトのキー順は作られ方によって変わりうるため）
function canonicalMelds(melds) {
  return (melds ?? []).map(m => [m?.type ?? null, m?.tiles ?? [], m?.from ?? null]);
}

function canonicalShape(p) {
  return JSON.stringify([
    p?.tiles ?? [],
    canonicalMelds(p?.melds),
    p?.dora ?? null,
    p?.problemType ?? 'default',
    p?.discardedTile ?? null,
    (p?.nakiChoices ?? []).map(c => [c?.tile ?? null, !!c?.correct]),
    p?.bakaze ?? null,
    p?.kyoku ?? null,
    p?.honba ?? null,
    p?.jikaze ?? null,
    p?.junme ?? null,
    (p?.otherDiscards ?? []).map(od => [
      od?.player ?? null,
      od?.tiles ?? [],
      od?.riichiIndex ?? null,
      canonicalMelds(od?.melds),
      od?.tsumogiri ?? null,
    ]),
    // scores はオブジェクトなので、キー順に依存しないよう明示的に並べる
    p?.scores
      ? [p.scores['東'] ?? null, p.scores['南'] ?? null, p.scores['西'] ?? null,
         p.scores['北'] ?? null, p.scores.kyotaku ?? null]
      : null,
  ]);
}

/**
 * 問題の骨格から16文字のバージョン文字列を作る。同じ骨格なら必ず同じ値になる。
 *
 * ブラウザ・Node・Edge Runtime のどれでも動くよう Web Crypto を使う（非同期）。
 * 16文字（64bit）に切っているのは、DBに持つ値を短くするため。
 * 総問題数がたかだか数万の規模では衝突は現実的に起きない。
 */
export async function problemKey(problem) {
  const bytes = new TextEncoder().encode(canonicalShape(problem));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// テストから正規化結果を覗くため（実装の中身を固定したいのはハッシュではなくこちら）
export const PROBLEM_KEY_INTERNALS = { canonicalShape };
