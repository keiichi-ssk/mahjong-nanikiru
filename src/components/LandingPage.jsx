/* 行き先は2つだけ。行全体が1つのリンクになる（iOS の設定画面・Material Design のナビゲーションリストの形）。
   説明文は「何ができるか」をそのまま書く（DESIGN.md の「キャッチー表現の禁止」）。 */
const DESTINATIONS = [
  {
    href: '/myproblems.html',
    title: '牌図作成',
    desc: '局面を並べて何切る問題を作り、Xで共有できます',
  },
  {
    href: '/chinitsu.html',
    title: 'メンチン何切る',
    desc: '清一色の手牌から切る牌を選ぶ練習です。ログイン不要',
  },
];

function ChevronRight() {
  return (
    <svg
      className="landing-nav-chevron"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * 未ログインでトップページに来た人向けのランディング（2026-11-04 に作り直した）。
 * 構成は「説明1行 → 行き先のリスト」だけ。ログインはヘッダー右上の「Google でログイン」が担当する
 * （ここにログインボタンやログインの説明を戻さないこと）。
 * PC もスマホも構造は同じで、出し分けをしない。
 */
export default function LandingPage() {
  return (
    <div className="landing">
      {/* 画面上の見出しは置かない方針（キャッチコピー的な見出しを撤去・2026-11-04）。
          ただしページの h1 が無くなると検索エンジン・スクリーンリーダーが困るので、見えない h1 だけ残す */}
      <h1 className="visually-hidden">座学する麻雀</h1>

      <p className="landing-lead">麻雀の「何切る」を学ぶサイトです。</p>

      <nav className="landing-nav" aria-label="コンテンツ">
        {DESTINATIONS.map(({ href, title, desc }) => (
          <a className="landing-nav-item" href={href} key={href}>
            <span className="landing-nav-text">
              <span className="landing-nav-title">{title}</span>
              <span className="landing-nav-desc">{desc}</span>
            </span>
            <ChevronRight />
          </a>
        ))}
      </nav>
    </div>
  );
}
