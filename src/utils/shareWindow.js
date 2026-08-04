// X の共有画面を新しいタブで開く。
//
// ★ problemShare.js と分けてあるのは意図的。あちらは api/ 配下（Vercel の Edge Function）からも
//   読み込まれるので window に触れない。DOM を使う処理はこちらに置くこと。
//
// ★ URL の組み立てが非同期（圧縮・トークンの発行）なので、**先に空のタブを開いてから URL を入れる**。
//   await のあとに window.open するとユーザー操作との連続性が切れ、ポップアップブロックに掛かる。
//   共有ボタンを新しく足すときも必ずこの関数を通すこと（同じ落とし穴を踏まないため）。
import { buildProblemShareUrl, buildTokenShareUrl } from './problemShare';

/**
 * 空のタブを先に開き、build() が返した URL へ飛ばす。成功したら true。
 * build() が失敗（例外・null）したらタブを閉じて false を返す。
 */
async function openShareWindow(build) {
  const win = window.open('about:blank', '_blank');
  let url;
  try {
    url = await build();
  } catch {
    url = null;
  }
  if (!url) {
    win?.close();
    return false;
  }
  if (win) {
    win.opener = null;
    win.location.href = url;
  } else {
    // ブロックされたときは同じタブで開く（何も起きないよりよい）
    window.location.href = url;
  }
  return true;
}

/**
 * 問題を X の投稿画面で開く（URL に問題の中身を載せる方式）。
 * 成功したら true、URL を作れなければ false。呼び出し側は false のときだけ画面にエラーを出せばよい。
 */
export async function openProblemShare(problem) {
  return openShareWindow(() => buildProblemShareUrl(problem));
}

/**
 * 保存済みの問題を共有トークンで開く（あとから編集しても同じURLで最新が見える方式）。
 *
 * getToken は「トークンを用意して返す」非同期関数。まだ発行されていなければ発行して返す
 * （＝発行は呼び出し側の責任。ここはタブの面倒だけを見る）。
 */
export async function openTokenShare(getToken) {
  return openShareWindow(async () => {
    const token = await getToken();
    return token ? buildTokenShareUrl(token) : null;
  });
}
