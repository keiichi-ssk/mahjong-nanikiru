// my問題集(β)の操作ガイド。
//   start  … 問題を選ぶ前の画面（.mp-placeholder）。カテゴリ作成〜問題追加まで
//   manual … 牌パレットの右の余白（ProblemEditor の paletteAside）。手牌〜保存
//   paifu  … 同上（牌譜から切り出すとき）
//
// 「どこから手を付ければいいか分からない」を防ぐのが目的なので、
// **手順そのもの**を作る順に並べる。現在地のハイライトはしない
// （編集中の手牌や正解は ProblemEditor 内部の state で、ここからは正確に追えないため）。
//
// 手順に入れると長くなる補足（他家の河・一覧からの変更など）は notes に置く。

const GUIDES = {
  // エディタを開く前。ここでできることだけを書く
  start: {
    title: 'はじめかた',
    steps: [
      { title: 'カテゴリを作る', hint: '「新しいカテゴリ名」に好きな名前を入れて「追加」' },
      { title: '問題を追加する', hint: 'カテゴリを選んで「＋ 新しい問題」' },
    ],
    notes: [
      '牌譜から作るときは「牌譜から」を選びます。',
      '※json牌譜ファイルが必要です',
    ],
  },
  // 手で1問ずつ作るときの流れ
  manual: {
    title: '問題を作る手順',
    steps: [
      { title: '手牌を並べる',   hint: '左の牌パレットをクリックすると盤面に入る（送り先が「手牌」のとき）' },
      { title: 'ドラを設定する', hint: '盤面の王牌をクリック、または送り先の「ドラ」を選んで牌パレットをクリック' },
      { title: '状況を設定する',   hint: '盤面の中央で局・巡目、自風を設定' },
      { title: '問題タイプを選ぶ', hint: '上の「問題タイプ:」で「リーチ判断」「鳴きタイミング」などに変えられる' },
      { title: '正解を選ぶ',       hint: '右の「正解設定」タブで、正解の牌をクリックして設定' },
      { title: '保存する',         hint: '右上の「保存」。保存した問題は本体アプリの書籍タブ「my問題集(β)」から出題される' },
    ],
    notes: [
      '他家の河は「捨て牌」タブで作れます。問題タイプと組み合わせると、鳴き・リーチ判断、押し引きの問題を作成できます。',
      '番号・タイトル・カテゴリは左の一覧から変更できます。',
    ],
  },
  // 牌譜から切り出すときの流れ
  paifu: {
    title: '牌譜から作る手順',
    steps: [
      { title: '牌譜を読み込む',   hint: '「牌譜から」でJSONファイルを選ぶ' },
      { title: '自分の席を選ぶ',   hint: '上の A / B / C / D。その人の視点になる' },
      { title: '局面を選ぶ',       hint: '局を選び ◀▶ で1手ずつ移動。絞り込みで「他家の打牌」も選べる' },
      { title: '問題タイプを選ぶ', hint: '他家の打牌の局面なら「鳴きタイミング」など' },
      { title: '正解を選ぶ',       hint: '右の「正解設定」タブ。実戦の打牌は正解ではないので参考まで' },
      { title: '保存する',         hint: '保存して初めて問題になり、本体アプリの「my問題集(β)」から出題される。続けて別の局面も切り出せる' },
    ],
  },
}

export default function EditorGuide({ mode = 'manual' }) {
  const guide = GUIDES[mode] ?? GUIDES.manual

  return (
    <div className="guide">
      <div className="guide-title">{guide.title}</div>
      <ol className="guide-list">
        {guide.steps.map((s, i) => (
          <li key={i} className="guide-item">
            <span className="guide-step">{i + 1}</span>
            <span className="guide-body">
              <span className="guide-step-title">{s.title}</span>
              <span className="guide-hint">{s.hint}</span>
            </span>
          </li>
        ))}
      </ol>
      {guide.notes?.map((n, i) => <p key={i} className="guide-note">{n}</p>)}
    </div>
  )
}
