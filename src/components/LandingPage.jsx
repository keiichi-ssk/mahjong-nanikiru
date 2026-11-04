import { useId, useLayoutEffect, useRef, useState } from 'react';

/* 行き先は2つだけ。行全体が1つのリンクになる（iOS の設定画面・Material Design のナビゲーションリストの形）。
   説明文は「何ができるか」をそのまま書く（DESIGN.md の「キャッチー表現の禁止」）。
   aboutKey は index.html の .site-about 内の data-about と対応する（「詳しく」の中身） */
const DESTINATIONS = [
  {
    href: '/myproblems.html',
    title: '何切るエディタ',
    desc: '局面を並べて何切る問題を作り、Xで共有できます',
    aboutKey: 'editor',
  },
  {
    href: '/chinitsu.html',
    title: 'メンチン何切る',
    desc: '清一色の手牌から切る牌を選ぶ練習です。ログイン不要',
    aboutKey: 'chinitsu',
  },
];

function ChevronDown() {
  return (
    <svg
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * index.html に直書きしてある説明ブロック（.site-about [data-about=…]）を、DOM ごとここへ移して表示する。
 * 文章を React 側に書き写さないのは、JSを実行しない検索エンジンにも同じ文章を読ませるため
 * （index.html が唯一の置き場所）。アンマウント時は元の場所へ戻す。
 */
function AboutSlot({ aboutKey, id, hidden }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const block = document.querySelector(`[data-about="${aboutKey}"]`);
    const slot = ref.current;
    if (!block || !slot) return undefined;
    const home = block.parentNode;
    slot.appendChild(block);
    return () => { home.appendChild(block); };
  }, [aboutKey]);
  // 閉じている間も DOM には置いたまま（hidden）にして、移した説明ブロックを保持する
  return <div ref={ref} id={id} className="landing-nav-more-body" hidden={hidden} />;
}

/**
 * 行き先1つ分。行（リンク）の右に開閉ボタン（⌄）を置き、開くと行の下に説明が出る
 * （Material Design の展開パネルの形）。<details> にしないのは、開閉部分（summary）の中に
 * リンクを入れられず、マークをリンクの横に並べられないため。
 */
function DestinationRow({ href, title, desc, aboutKey }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className="landing-nav-group">
      <div className="landing-nav-row">
        <a className="landing-nav-item" href={href}>
          <span className="landing-nav-title">{title}</span>
          <span className="landing-nav-desc">{desc}</span>
        </a>
        <button
          type="button"
          className={`landing-nav-toggle${open ? ' landing-nav-toggle--open' : ''}`}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${title}の詳しい説明`}
          onClick={() => setOpen(o => !o)}
        >
          <ChevronDown />
        </button>
      </div>
      <AboutSlot aboutKey={aboutKey} id={bodyId} hidden={!open} />
    </div>
  );
}

/**
 * 未ログインでトップページに来た人向けのランディング（2026-11-04 に作り直した）。
 * 構成は「説明1行 → 行き先のリスト（各行の右の ⌄ で説明が開く）」だけ。
 * ログインはヘッダー右上の「Google でログイン」が担当する（ここにログインボタンやログインの説明を戻さないこと）。
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
        {DESTINATIONS.map(d => <DestinationRow key={d.href} {...d} />)}
      </nav>
    </div>
  );
}
