// 管理画面の盤面ビュー。編集中の問題データを麻雀卓の形で描画し、
// 各領域をクリックすると右カラムの対応する編集パネルへ切り替わる（クリックは「開く」だけで、
// 盤面から直接データを書き換えることはしない）。
//
// 河の枚数・裏向き・網掛けの判定は utils/boardUtils.js の純粋関数に置いてある。
// ここに判定ロジックを書き戻さないこと。
//
// 【向きの扱い】各家の「河＋副露」はその家の視点で組み立ててから、ブロックごと回転させる。
// こうすると牌の向き・並び順・行の進む方向・副露の位置（その家から見た右下）が一度に正しくなる。
// 回転すると見た目の縦横が入れ替わるため、外側のラッパーには入れ替えたサイズを持たせる。
// サイズ計算に牌の寸法が要るので、寸法は CSS ではなくこのファイル（TILE）が持つ。
import { getTileImageUrl, getTileLabel, getDoraIndicator } from '../utils/tileUtils'
import { getMeldTileRole } from '../utils/problemConstants'
import { seatWinds, collectCalledTiles, buildRiver } from '../utils/boardUtils'

const RIVER_COLUMNS = 6 // 1行あたりの捨て牌の枚数（実卓と同じ6枚）

// 盤面の牌の寸法（px）。盤面は編集の主役なのでパレットより大きく取る
const TILE      = { w: 26, h: 35, gap: 2, meldGap: 6 }
const HAND_TILE = { w: 38, h: 50, gap: 3, meldGap: 8 }

// 手牌の並びの長さ（その家から見た横幅）
function handLength(count, size) {
  return count > 0 ? count * size.w + (count - 1) * size.gap : 0
}

// 手牌が空のときに出す「手牌が未設定です」の幅。手牌と同じ扱いで辺の中央に置くため、
// 長さ0ではなくこの値を渡す（0 だと左端が辺の中央に来て右へずれる）。
// admin.css の .board-empty-text の width と必ず揃えること
const EMPTY_HAND_LEN = 150

// 手牌の置き場は各辺いっぱい。手牌は辺の中央、副露はその家から見た右端に置き、
// 両者が重なるときだけ手牌を必要な分だけ左へ寄せる（実際の判定は CSS の min() が行う）。
// その計算に使う長さをカスタムプロパティで渡す
function seatVars(handLen, meldLen, depth) {
  return {
    '--hand-len': `${handLen}px`,
    '--meld-len': `${meldLen}px`,
    '--seat-depth': `${depth}px`,
  }
}

// 王牌の枚数。左端がドラ表示牌で、残りは裏向き
const DEAD_WALL_COUNT = 5
// 中央（局設定）に置く王牌の牌サイズ。5枚＋gap で .board-center-info の 124px に収める
const WALL_TILE = { w: 23, h: 30, gap: 2, meldGap: 6 }

// 自分から見た各席の回転角（時計回り・度）。自分の視点が 0°
const SEAT_ANGLE = { 上家: 90, 対面: 180, 下家: -90 }

// 自風をクリックで切り替える順番
const WIND_ORDER = ['東', '南', '西', '北']

// 場風と局は「東1局」〜「西4局」の1つのセレクタにまとめる（別々に選ばせると片方の選び忘れが起きる）
const KYOKU_OPTIONS = ['東', '南', '西'].flatMap(b =>
  [1, 2, 3, 4].map(k => ({ value: `${b}${k}`, label: `${b}${k}局` }))
)

function BoardTile({ tile, rotated = false, size = TILE, className = '' }) {
  const slotStyle = { width: rotated ? size.h : size.w, height: rotated ? size.w : size.h }
  if (!tile) {
    // 裏向き。出題画面のドラ表示牌の裏（.dora-indicator-back）と同じ見た目を CSS で描く
    return <span className={`board-tile board-tile--back ${className}`} style={slotStyle} />
  }
  return (
    <span className={`board-tile-slot ${className}`} style={slotStyle}>
      <img
        className="board-tile"
        src={getTileImageUrl(tile)}
        alt={getTileLabel(tile)}
        style={{
          width: size.w,
          height: size.h,
          transform: rotated ? 'rotate(90deg)' : undefined,
        }}
      />
    </span>
  )
}

// ===== サイズ計算（回転ラッパーに渡す寸法を求める） =====

function riverSize(count) {
  if (count === 0) return { w: 0, h: 0 }
  const cols = Math.min(RIVER_COLUMNS, count)
  const rows = Math.ceil(count / RIVER_COLUMNS)
  return {
    w: cols * TILE.w + (cols - 1) * TILE.gap,
    h: rows * TILE.h + (rows - 1) * TILE.gap,
  }
}

function meldWidth(meld, size = TILE) {
  const tilesWidth = meld.tiles.reduce(
    (sum, _, i) => sum + (getMeldTileRole(meld.type, i, meld.from) === 'rotated' ? size.h : size.w),
    0
  )
  return tilesWidth + (meld.tiles.length - 1)
}

function meldsWidth(melds, size = TILE) {
  if (!melds?.length) return 0
  return melds.reduce((sum, m) => sum + meldWidth(m, size), 0) + (melds.length - 1) * size.meldGap
}

// 他家の手牌（裏向き）の枚数。副露1組につき手牌から3枚減る（カンも嶺上牌を引くので同じ）。
// 牌譜から局面を再現しているときは実際の枚数（ツモ直後なら14枚）が渡されるので、そちらを優先する
function concealedHandCount(melds, actual) {
  if (Number.isInteger(actual)) return Math.max(0, actual)
  return Math.max(0, 13 - 3 * (melds?.length ?? 0))
}

// ===== 描画 =====

// 副露1組。横向きの牌の位置は鳴いた元で変わる（getMeldTileRole が唯一の実装）
function BoardMeld({ meld, size = TILE }) {
  return (
    <div className="board-meld">
      {meld.tiles.map((tile, i) => {
        const role = getMeldTileRole(meld.type, i, meld.from)
        if (role === 'back') return <BoardTile key={i} tile={null} size={size} />
        return <BoardTile key={i} tile={tile} rotated={role === 'rotated'} size={size} />
      })}
    </div>
  )
}

// 副露の並びは「最初の鳴きが右端」。データは鳴いた順のまま、CSS の row-reverse で反転させる
function BoardMelds({ melds, size = TILE }) {
  if (!melds?.length) return null
  return (
    <div className="board-melds">
      {melds.map((meld, i) => <BoardMeld key={i} meld={meld} size={size} />)}
    </div>
  )
}

// 1家ぶんの河。riichiIndex の牌はリーチ宣言牌として横向きにする
function BoardRiver({ cells, riichiIndex }) {
  const rows = []
  for (let i = 0; i < cells.length; i += RIVER_COLUMNS) {
    rows.push(cells.slice(i, i + RIVER_COLUMNS).map((cell, j) => ({ ...cell, index: i + j })))
  }
  return (
    <div className="board-river">
      {rows.map((row, ri) => (
        <div key={ri} className="board-river-row">
          {row.map(cell => (
            <BoardTile
              key={cell.index}
              tile={cell.tile}
              rotated={cell.index === riichiIndex}
              // board-river-cell は「河の牌」であることの目印。
              // 手牌や王牌にも裏向きがあるため、テストが河だけを数えるのに使う
              className={`board-river-cell${cell.called ? ' board-tile--called' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// その家の視点で組み立てた中身を、席の角度でブロックごと回転させる汎用の枠。
// 回転は要素の占有サイズを変えないため、外側に縦横を入れ替えたサイズを持たせて内側を中央で回す
function RotatedBlock({ angle, width, height, className = '', children }) {
  if (width === 0 || height === 0) return null
  const rotated = Math.abs(angle) === 90
  return (
    <div className="board-rot" style={{ width: rotated ? height : width, height: rotated ? width : height }}>
      <div
        className={`board-rot-inner ${className}`}
        style={{ width, height, transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
      >
        {children}
      </div>
    </div>
  )
}

// 1家ぶんの河（捨て牌のみ）
function SeatRiverBlock({ cells, riichiIndex, angle }) {
  const river = riverSize(cells.length)
  // リーチ宣言牌は横向きになるぶん、その行だけ幅が広がる
  const riichiExtra = riichiIndex != null && riichiIndex < cells.length ? TILE.h - TILE.w : 0
  return (
    <RotatedBlock angle={angle} width={river.w + riichiExtra} height={river.h}>
      <BoardRiver cells={cells} riichiIndex={riichiIndex} />
    </RotatedBlock>
  )
}

// 1家ぶんの手牌（裏向き）。辺の中央に置くので、副露の有無で位置が動かないよう別ブロックにしてある
// （自分の手牌と同じ考え方。副露は SeatMeldBlock が辺の端に置く）
function SeatHandBlock({ handCount, angle }) {
  const width = handLength(handCount, TILE)
  return (
    <RotatedBlock angle={angle} width={width} height={width ? TILE.h : 0} className="board-seat-hand-row">
      <div className="board-seat-hand">
        {Array.from({ length: handCount }, (_, i) => (
          <BoardTile key={i} tile={null} className="board-seat-hand-tile" />
        ))}
      </div>
    </RotatedBlock>
  )
}

// 1家ぶんの副露。その家から見た右端（席ごとに画面上の向きが違う）に絶対配置する
function SeatMeldBlock({ melds, angle }) {
  const width = meldsWidth(melds)
  return (
    <RotatedBlock angle={angle} width={width} height={width ? TILE.h : 0} className="board-seat-hand-row">
      <BoardMelds melds={melds} />
    </RotatedBlock>
  )
}

// クリックできる領域の共通枠。
// 中身が何も無い領域は、そのままだと大きさが 0 になってクリックできなくなるため、
// empty のときだけ破線のプレースホルダーを出す（見た目を素の卓に近づけるため通常時は枠なし）
function BoardArea({ className = '', active, empty, style, onClick, children }) {
  return (
    <button
      type="button"
      className={
        `board-area ${className}` +
        (active ? ' board-area--active' : '') +
        (empty ? ' board-area--empty' : '')
      }
      style={style}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// 王牌。一番左がドラ表示牌で、残りは裏向き
function BoardDeadWall({ indicator }) {
  return (
    <div className="board-dead-wall">
      {Array.from({ length: DEAD_WALL_COUNT }, (_, i) => (
        <BoardTile key={i} tile={i === 0 ? indicator : null} size={WALL_TILE} />
      ))}
    </div>
  )
}

// 盤面上で直接編集する状況設定のセレクタ（局・本場・巡目）。
// 未設定を選べるようにしたいので value には '' を使う。
// options は文字列の配列（表示は値＋suffix）か、{value, label} の配列
function BoardSelect({ value, onChange, options, suffix = '', title }) {
  return (
    <select
      className="board-select"
      title={title}
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">—</option>
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? `${o}${suffix}` : o.label
        return <option key={v} value={v}>{label}</option>
      })}
    </select>
  )
}

export default function BoardView({
  tiles = [], melds = [], dora, answerList = [],
  bakaze, kyoku, honba, jikaze, junme, scores, otherDiscards = [],
  // 他家の手牌の実際の枚数 { 東: 14, 南: 13, … }。牌譜から局面を再現するときだけ渡す
  // （渡さなければ 13 − 3×副露数 で表示する）。problem には保存されない表示専用の情報
  concealedCounts = null,
  activeArea, onSelectArea,
  // 盤面上で直接編集するためのコールバック（渡さなければ表示のみになる）
  onChangeBakaze, onChangeKyoku, onChangeHonba, onChangeJikaze, onChangeJunme, onRemoveHandTile,
}) {
  const called = collectCalledTiles({ jikaze, melds, otherDiscards })

  // 席（上家・対面・下家）と他家ブロックの対応。自風が未設定のときは風で引けないので、
  // 入力された順に席へ割り当てる（盤面の位置は目安になるが編集はできる）
  const seats = seatWinds(jikaze).map(({ relative, wind }, i) => {
    const index = wind
      ? otherDiscards.findIndex(od => od.player === wind)
      : (i < otherDiscards.length ? i : -1)
    const od = index >= 0 ? otherDiscards[index] : null
    return {
      relative,
      wind: wind ?? od?.player ?? null,
      index,
      od,
      cells: buildRiver({
        tiles: od?.tiles ?? [],
        junme,
        meldCount: od?.melds?.length ?? 0,
        calledTiles: called[wind ?? od?.player] ?? [],
        revealCalled: false, // 他家の鳴かれた牌は裏向きのまま（網掛けだけ付く）
      }),
    }
  })

  // 自分の捨て牌も他家と同じ配列に入る（家＝自風のブロック）。
  // 未設定なら従来どおり「巡目＋副露数」枚の裏向きになる
  const selfIndex = jikaze ? otherDiscards.findIndex(od => od.player === jikaze) : -1
  const selfOd = selfIndex >= 0 ? otherDiscards[selfIndex] : null
  const selfCells = buildRiver({
    tiles: selfOd?.tiles ?? [],
    junme,
    meldCount: melds.length,
    calledTiles: called[jikaze] ?? [],
  })

  const doraIndicator = dora ? getDoraIndicator(dora) : null
  const score = w => scores?.[w]
  // 手牌タブを開いている間だけ、盤面の手牌クリックが削除になる
  const handEditable = activeArea === 'hand' && !!onRemoveHandTile

  // 自風はクリックのたびに 東→南→西→北 と切り替える（中央にセレクタを置かない）。
  // 他家の風・席の並びは seatWinds(jikaze) から導出しているので自動で追従する
  function cycleJikaze() {
    onChangeJikaze(WIND_ORDER[(WIND_ORDER.indexOf(jikaze) + 1) % WIND_ORDER.length])
  }

  // 点数は盤面では設定しづらいのでクリックで編集パネル（点数タブ）を開く。
  // 位置は状況設定フィールドの四辺の中央（上＝対面 / 左＝上家 / 右＝下家 / 下＝自分）。
  // 自分の風バッジだけは例外で、クリックすると自風が切り替わる。
  // button の入れ子は不正なので、チップ自体は div にして中の風・点数を button にする
  function seatScore(wind, relative, side, editableWind = false) {
    return (
      <div
        className={
          `board-score board-score--${side}` +
          (wind && wind === jikaze ? ' board-score--self' : '')
        }
      >
        {editableWind ? (
          <button
            type="button"
            className="board-score-wind"
            onClick={cycleJikaze}
            title="クリックで自風を変更（他家の風も連動）"
          >
            {wind ?? relative}
          </button>
        ) : (
          <button
            type="button"
            className="board-score-wind"
            onClick={() => onSelectArea('jokyo', wind)}
            title="点数を編集"
          >
            {wind ?? relative}
          </button>
        )}
        {/* どの家をクリックしたかを渡し、編集パネル側でその家の入力行をハイライトさせる */}
        <button
          type="button"
          className="board-score-value"
          onClick={() => onSelectArea('jokyo', wind)}
          title="点数を編集"
        >
          {score(wind) ?? '—'}
        </button>
      </div>
    )
  }

  // 他家の河。手牌とは別のクリック領域だが、開く先は同じ捨て牌タブ
  function seatRiverArea(seat, className) {
    return (
      <BoardArea
        className={`board-seat ${className}`}
        active={activeArea === `sutehai:${seat.index}`}
        empty={seat.cells.length === 0}
        onClick={() => onSelectArea('sutehai', seat.index)}
      >
        <SeatRiverBlock
          cells={seat.cells}
          riichiIndex={seat.od?.riichiIndex ?? null}
          angle={SEAT_ANGLE[seat.relative]}
        />
      </BoardArea>
    )
  }

  // 他家の手牌＋副露。盤面の外端に置く。
  // 手牌は辺の中央（副露と重なるときだけ左へ寄る）、副露はその家から見た右端。
  // 位置の計算に使う長さは CSS カスタムプロパティで渡す（判定は CSS の min() が行う）
  function seatHandArea(seat, className) {
    const melds = seat.od?.melds ?? []
    const handCount = concealedHandCount(melds, concealedCounts?.[seat.wind])
    return (
      <BoardArea
        className={`board-seat ${className}`}
        active={activeArea === `sutehai:${seat.index}`}
        style={seatVars(handLength(handCount, TILE), meldsWidth(melds), TILE.h)}
        onClick={() => onSelectArea('sutehai', seat.index)}
      >
        <span className="board-seat-hand-slot">
          <SeatHandBlock handCount={handCount} angle={SEAT_ANGLE[seat.relative]} />
        </span>
        {melds.length > 0 && (
          <span className="board-seat-melds">
            <SeatMeldBlock melds={melds} angle={SEAT_ANGLE[seat.relative]} />
          </span>
        )}
      </BoardArea>
    )
  }

  return (
    <div className="board">
      {/* 外側は各家の手牌（盤面の端）、内側は河と局設定。
          手牌は幅が広いので内側グリッドに入れると中央の列を押し広げてしまう */}
      <div className="board-outer">
        <div className="board-outer-cell board-outer--top">{seatHandArea(seats[1], 'board-seat--top')}</div>
        <div className="board-outer-cell board-outer--left">{seatHandArea(seats[0], 'board-seat--left')}</div>
        <div className="board-outer-cell board-outer--center">
      <div className="board-grid">
        <div className="board-cell board-cell--top">{seatRiverArea(seats[1], 'board-seat--top')}</div>
        <div className="board-cell board-cell--left">{seatRiverArea(seats[0], 'board-seat--left')}</div>

        {/* 中央は局・巡目・自風・ドラをその場で編集する。
            クリックで開くだけの他の領域と違い、フォーム部品を直に置くので button にはしない */}
        <div className="board-cell board-cell--center">
          <div className={`board-center${activeArea === 'jokyo' ? ' board-center--active' : ''}`}>
            {seatScore(seats[1].wind, '対面', 'top')}
            {seatScore(seats[0].wind, '上家', 'left')}
            {seatScore(seats[2].wind, '下家', 'right')}
            {seatScore(jikaze, '自分', 'bottom', !!onChangeJikaze)}
            <div className="board-center-info">
                <button
                  type="button"
                  className="board-dead-wall-btn"
                  onClick={() => onSelectArea('dora')}
                  title="ドラを設定（下のパレットから牌を選ぶ）"
                >
                  <BoardDeadWall indicator={doraIndicator} />
                </button>
                <div className="board-setting-row">
                  {/* 場風＋局はひとつのセレクタ。どちらか片方だけの旧データは未選択（—）扱いになる */}
                  <BoardSelect
                    value={bakaze && kyoku != null ? `${bakaze}${kyoku}` : null}
                    onChange={v => {
                      onChangeBakaze(v == null ? null : v.slice(0, 1))
                      onChangeKyoku(v == null ? null : Number(v.slice(1)))
                    }}
                    options={KYOKU_OPTIONS}
                    title="場風・局"
                  />
                  <BoardSelect
                    value={honba == null ? null : String(honba)}
                    onChange={v => onChangeHonba(v == null ? null : Number(v))}
                    options={Array.from({ length: 11 }, (_, i) => String(i))}
                    suffix="本場"
                    title="本場"
                  />
                </div>
                <div className="board-setting-row">
                  <BoardSelect
                    value={junme == null ? null : String(junme)}
                    onChange={v => onChangeJunme(v == null ? null : Number(v))}
                    options={Array.from({ length: 20 }, (_, i) => String(i + 1))}
                    suffix="巡目"
                    title="巡目"
                  />
                </div>
                {scores?.kyotaku > 0 && (
                  <div className="board-kyotaku">供託 {scores.kyotaku}</div>
                )}
            </div>
          </div>
        </div>

        <div className="board-cell board-cell--right">{seatRiverArea(seats[2], 'board-seat--right')}</div>

        <div className="board-cell board-cell--bottom">
          <BoardArea
            className="board-seat board-seat--self"
            active={activeArea === `sutehai:${selfIndex}`}
            empty={selfCells.length === 0}
            onClick={() => onSelectArea('sutehai', selfIndex)}
          >
            <SeatRiverBlock
              cells={selfCells}
              riichiIndex={selfOd?.riichiIndex ?? null}
              angle={0}
            />
          </BoardArea>
        </div>
      </div>
        </div>
        <div className="board-outer-cell board-outer--right">{seatHandArea(seats[2], 'board-seat--right')}</div>

        {/* 自分の手牌も盤面の端（最下段）。
            手牌タブを開いている間だけ、牌のクリックがその牌の削除になる。
            牌ごとに button を置くので、この領域自体は button にしない（入れ子は不正） */}
        <div className="board-outer-cell board-outer--bottom">
          <div
            className={
              'board-area board-hand' +
              (handEditable ? ' board-area--active' : '') +
              (tiles.length === 0 ? ' board-area--empty' : '')
            }
            style={seatVars(
              tiles.length > 0 ? handLength(tiles.length, HAND_TILE) : EMPTY_HAND_LEN,
              meldsWidth(melds, HAND_TILE),
              HAND_TILE.h,
            )}
          >
            <div className="board-hand-row">
              <div className="board-hand-tiles board-seat-hand-slot">
                {tiles.map((tile, i) => (
                  <button
                    key={i}
                    type="button"
                    className="board-tile-btn"
                    onClick={() => handEditable ? onRemoveHandTile?.(i) : onSelectArea('hand')}
                    title={handEditable ? 'クリックで削除' : '手牌を編集'}
                  >
                    <BoardTile
                      tile={tile}
                      size={HAND_TILE}
                      className={answerList.includes(tile) ? 'board-tile--answer' : ''}
                    />
                  </button>
                ))}
                {tiles.length === 0 && (
                  <button type="button" className="board-empty-text" onClick={() => onSelectArea('hand')}>
                    手牌が未設定です
                  </button>
                )}
              </div>
              {melds.length > 0 && (
                <button
                  type="button"
                  className="board-melds-btn board-seat-melds"
                  onClick={() => onSelectArea('hand')}
                  title="手牌を編集"
                >
                  <BoardMelds melds={melds} size={HAND_TILE} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
