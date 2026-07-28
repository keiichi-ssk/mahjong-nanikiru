/* アイコンは絵文字ではなくインラインSVGで持つ（環境差で字形が変わらない・色を継承できるため）。
   外部アイコンライブラリは追加しない方針。stroke幅・角の丸めは3つで統一すること。 */
function iconProps() {
  return {
    className: 'landing-feature-icon',
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
}

function IconShuffle() {
  return (
    <svg {...iconProps()}>
      <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
      <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
      <path d="m18 14 4 4-4 4" />
    </svg>
  );
}

function IconTimer() {
  return (
    <svg {...iconProps()}>
      <line x1="10" y1="2" x2="14" y2="2" />
      <line x1="12" y1="14" x2="15" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg {...iconProps()}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

const FEATURES = [
  {
    Icon: IconShuffle,
    title: '無限ランダム出題',
    desc: '手牌はその場で生成されるので出題が尽きません。答えを覚えてしまうこともありません。',
  },
  {
    Icon: IconTimer,
    title: '90秒タイムアタック',
    desc: '制限時間内の正答数を競います。その日のスコアはデイリーランキングに載ります。',
  },
  {
    Icon: IconReview,
    title: '間違えた手牌だけ復習',
    desc: 'タイムアタックで誤答した手牌を、そのまま解き直せます。',
  },
];

/**
 * 未ログインでトップページに来た人向けのランディング。
 * 主目的は「無料ドリル（/chinitsu.html）へ送ること」なので、主CTAは1つだけ置く。
 *
 * ログイン導線は最下部の副次セクションのまま。ドリルは登録不要で遊べるので、
 * 訪問者にとって最初の一歩はログインではないため（同格に並べると main CTA が薄まる）。
 * ただし my問題集(β)の一般公開（2026-07-28）で、ログインすれば誰でも使えるものが増えたので、
 * 「ログインしてできること」を具体的に書いて行き止まり感を無くしている。
 * **CTAを増やして解決しないこと** — 増やすなら主CTAの格上げとして設計し直す。
 */
export default function LandingPage({ onLogin }) {
  return (
    <div className="landing">
      <section className="landing-hero">
        <h1 className="landing-title">解いて、強くなる</h1>
        {/* 見出しに準じる短い一行なので句点は付けない */}
        <p className="landing-lead">一問一答形式の麻雀学習サイト</p>
        <a className="landing-cta" href="/chinitsu.html">今すぐメンチン何切るドリルを始める</a>
        <p className="landing-note">登録不要・PC / スマートフォンからそのまま遊べます</p>
      </section>

      <section className="landing-features">
        {FEATURES.map(({ Icon, title, desc }) => (
          <div className="landing-feature" key={title}>
            <Icon />
            <h2>{title}</h2>
            <p>{desc}</p>
          </div>
        ))}
      </section>

      <section className="landing-secondary">
        <h2>ログインしてできること</h2>
        <ul className="landing-benefits">
          <li>
            <strong>my問題集(β)をつくる</strong>
            <span>
              気になった局面を自分の問題として登録し、何度でも解き直せます。
              牌譜（JSONファイル）を読み込めば、実戦の局面をそのまま問題にできます。
              <br />
              どなたでもご利用いただけます（20問まで）。
              問題を作る画面はPC専用ですが、解くのはスマートフォンでもできます。
            </span>
          </li>
          <li>
            <strong>何切る問題集を解く</strong>
            <span>局面つきの何切る問題を分野別に収録した問題集です。こちらは現在<b>限定公開</b>です。</span>
          </li>
        </ul>
        <button className="landing-login-btn" onClick={onLogin}>
          Googleでログイン
        </button>
      </section>
    </div>
  );
}
