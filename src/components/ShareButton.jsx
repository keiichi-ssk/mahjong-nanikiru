// X（旧Twitter）へのシェアボタン。X公式シェアボタン風の黒地×白ロゴ。
//
// リンク先の組み立て方は用途ごとに違う（メンチンの手牌 / タイムアタックの結果 / 自作問題）ので、
// このコンポーネントは href を受け取るだけにしてある。
// href が null のあいだ（自作問題は圧縮が非同期なので URL がまだ無い）は何も描かない。
export default function ShareButton({ href, children = 'この問題をシェア' }) {
  if (!href) return null;
  return (
    <a
      className="chinitsu-share-btn"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg className="chinitsu-share-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
      </svg>
      {children}
    </a>
  );
}
