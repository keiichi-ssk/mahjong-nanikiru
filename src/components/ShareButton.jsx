// X（旧Twitter）へのシェアボタン。X公式シェアボタン風の黒地×白ロゴ。
//
// リンク先の組み立て方は用途ごとに違う（メンチンの手牌 / タイムアタックの結果 / 自作問題）ので、
// このコンポーネントはリンク先を受け取るだけにしてある。**Xのロゴはここが唯一の実装**なので、
// 新しく共有ボタンを足すときも必ずこれを使うこと（SVGを複製しない）。
//
// 2つの使い方がある:
//   - href … URL が先に決まっているとき。<a> で描く。
//            href が null のあいだ（自作問題は圧縮が非同期）は何も描かない
//   - onClick … 押した時点の内容から URL を作るとき（管理画面の編集中の問題など）。<button> で描く。
//            **編集のたびに圧縮し直すのは無駄なので、入力途中で URL を作らないこと**
import { track, shareSource, EVENTS } from '../utils/analytics';

export default function ShareButton({ href, onClick, disabled = false, title, children = 'この問題をシェア' }) {
  // ★ 共有の計測はここ1つで全箇所ぶん取れる（このコンポーネントがXシェアの唯一の入口のため）。
  //   どの画面から押されたかは shareSource() が URL から判定するので、呼び出し側は何もしなくてよい
  function handleShare(e) {
    track(EVENTS.problemShared, { source: shareSource() });
    onClick?.(e);
  }

  const icon = (
    <svg className="chinitsu-share-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );

  if (onClick) {
    return (
      <button className="chinitsu-share-btn" type="button" onClick={handleShare} disabled={disabled} title={title}>
        {icon}
        {children}
      </button>
    );
  }

  if (!href) return null;
  return (
    <a
      className="chinitsu-share-btn"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      onClick={handleShare}
    >
      {icon}
      {children}
    </a>
  );
}
