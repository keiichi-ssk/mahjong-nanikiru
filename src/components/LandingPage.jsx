/* アイコンは絵文字ではなくインラインSVGで持つ（環境差で字形が変わらない・色を継承できるため）。
   外部アイコンライブラリは追加しない方針。stroke幅・角の丸めは全アイコンで統一すること。 */
function iconProps(size = 20) {
  return {
    className: 'landing-feature-icon',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
}

function IconLayout() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg {...iconProps()}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg {...iconProps()}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </svg>
  );
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

/* 2つのコンテンツ。1枚のカードが「見出し → 要点3つ → CTA」で完結する形にしてある（2026-08-02〜）。
   ★ CTAをヒーローではなくカードの中に置くのは、スマホで縦に積んだときに
     「どの説明のボタンなのか」が離れないようにするため。ヒーローにCTA行を戻さないこと。
   説明文（desc）は1行で収まる長さに保つ —— スマホで2行になると3項目で縦が伸びすぎる。 */
const CONTENTS = [
  {
    key: 'make',
    href: '/myproblems.html',
    title: '何切る問題をつくる',
    ctaLabel: '問題をつくる',
    points: [
      {
        Icon: IconLayout,
        title: '局面をならべるだけ',
        desc: '手牌・ドラ・巡目を選ぶだけ',
      },
      {
        Icon: IconBook,
        title: '保存して問題集にする',
        desc: 'my問題集(β) で何度でも解き直せます',
      },
      {
        Icon: IconShare,
        title: 'Xで共有する',
        desc: 'リンクひとつ。相手のログインも不要',
      },
    ],
  },
  {
    key: 'chinitsu',
    href: '/chinitsu.html',
    title: 'メンチン何切るドリル',
    ctaLabel: 'ドリルを始める',
    points: [
      {
        Icon: IconShuffle,
        title: '無限ランダム出題',
        desc: '手牌はその場で生成。出題が尽きません',
      },
      {
        Icon: IconTimer,
        title: '90秒タイムアタック',
        desc: 'その日のスコアがランキングに載ります',
      },
      {
        Icon: IconReview,
        title: '間違えた手牌だけ復習',
        desc: '誤答した手牌をそのまま解き直せます',
      },
    ],
  },
];

/**
 * 未ログインでトップページに来た人向けのランディング。
 * 構成は「ヒーロー → コンテンツ2枚（CTA込み） → ログイン案内」の1カラム。
 * PCは2カラム・スマホは縦積みになるだけで、**構造はどちらも同じ**（出し分けをしないこと）。
 *
 * ★ 塗りのCTA（.landing-cta）は **登録不要で始められるコンテンツのカードに1つずつ**。
 *   **行き止まりに落ちる導線（ログイン必須のもの）をカードとして増やさないこと**。
 *
 * ログイン導線は最下部の副次セクションのまま。ドリルも作問も登録不要で始められるので、
 * 訪問者にとって最初の一歩はログインではないため（同格に並べるとCTAが薄まる）。
 */
export default function LandingPage({ onLogin }) {
  return (
    <div className="landing">
      <section className="landing-hero">
        <h1 className="landing-title">解いて、強くなる</h1>
        {/* 見出しに準じる短い一行なので句点は付けない */}
        <p className="landing-lead">一問一答形式の麻雀学習サイト</p>
      </section>

      <section className="landing-contents">
        {CONTENTS.map(({ key, href, title, ctaLabel, points }) => (
          <div className="landing-content-card" key={key}>
            <h2>{title}</h2>
            <ul className="landing-points">
              {points.map(({ Icon, title: pointTitle, desc }) => (
                <li key={pointTitle}>
                  <Icon />
                  <div>
                    <strong>{pointTitle}</strong>
                    <span>{desc}</span>
                  </div>
                </li>
              ))}
            </ul>
            <a className="landing-cta" href={href}>{ctaLabel}</a>
          </div>
        ))}
      </section>

      <section className="landing-secondary">
        <h2>ログインしてできること</h2>
        <ul className="landing-benefits">
          <li>
            <strong>作った問題を保存する</strong>
            <span>
              問題を作るだけならログインは要りませんが、保存できるのはログインしてからです。
              保存した問題は my問題集(β) に入り、何度でも解き直せます。
              <br />
              どなたでもご利用いただけます（20問まで）。
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
