// X の共有画面を新しいタブで開く。
//
// ★ problemShare.js と分けてあるのは意図的。あちらは api/ 配下（Vercel の Edge Function）からも
//   読み込まれるので window に触れない。DOM を使う処理はこちらに置くこと。
//
// ★ 圧縮が非同期なので、**先に空のタブを開いてから URL を入れる**。
//   await のあとに window.open するとユーザー操作との連続性が切れ、ポップアップブロックに掛かる。
//   共有ボタンを新しく足すときも必ずこの関数を通すこと（同じ落とし穴を踏まないため）。
import { buildProblemShareUrl } from './problemShare';

/**
 * 問題を X の投稿画面で開く。成功したら true、URL を作れなければ false。
 * 呼び出し側は false のときだけ画面にエラーを出せばよい。
 */
export async function openProblemShare(problem) {
  const win = window.open('about:blank', '_blank');
  let url;
  try {
    url = await buildProblemShareUrl(problem);
  } catch {
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
