const BASE_URL = '/tiles/';

const TILE_NAME_MAP = {
  '1m': 'Man1', '2m': 'Man2', '3m': 'Man3', '4m': 'Man4', '5m': 'Man5', '0m': 'Man5-Dora',
  '6m': 'Man6', '7m': 'Man7', '8m': 'Man8', '9m': 'Man9',
  '1p': 'Pin1', '2p': 'Pin2', '3p': 'Pin3', '4p': 'Pin4', '5p': 'Pin5', '0p': 'Pin5-Dora',
  '6p': 'Pin6', '7p': 'Pin7', '8p': 'Pin8', '9p': 'Pin9',
  '1s': 'Sou1', '2s': 'Sou2', '3s': 'Sou3', '4s': 'Sou4', '5s': 'Sou5', '0s': 'Sou5-Dora',
  '6s': 'Sou6', '7s': 'Sou7', '8s': 'Sou8', '9s': 'Sou9',
  '1z': 'Ton', '2z': 'Nan', '3z': 'Shaa', '4z': 'Pei',
  '5z': 'Haku', '6z': 'Hatsu', '7z': 'Chun',
  'back': 'Back',
};

const TILE_LABEL_MAP = {
  '1m': '一萬', '2m': '二萬', '3m': '三萬', '4m': '四萬', '5m': '五萬', '0m': '赤五萬',
  '6m': '六萬', '7m': '七萬', '8m': '八萬', '9m': '九萬',
  '1p': '一筒', '2p': '二筒', '3p': '三筒', '4p': '四筒', '5p': '五筒', '0p': '赤五筒',
  '6p': '六筒', '7p': '七筒', '8p': '八筒', '9p': '九筒',
  '1s': '一索', '2s': '二索', '3s': '三索', '4s': '四索', '5s': '五索', '0s': '赤五索',
  '6s': '六索', '7s': '七索', '8s': '八索', '9s': '九索',
  '1z': '東', '2z': '南', '3z': '西', '4z': '北',
  '5z': '白', '6z': '發', '7z': '中',
};

export function getTileImageUrl(tile) {
  const name = TILE_NAME_MAP[tile];
  return name ? `${BASE_URL}${name}.svg` : null;
}

export function getTileLabel(tile) {
  return TILE_LABEL_MAP[tile] ?? tile;
}

// ドラ → ドラ表示牌（1つ前の牌）を逆算
export function getDoraIndicator(doraTile) {
  if (!doraTile) return null;
  const suit = doraTile.slice(-1);
  const n = doraTile[0] === '0' ? 5 : parseInt(doraTile[0], 10);
  if (suit === 'm' || suit === 'p' || suit === 's') {
    return `${n === 1 ? 9 : n - 1}${suit}`;
  }
  if (suit === 'z') {
    if (n <= 4) return `${n === 1 ? 4 : n - 1}z`; // 風牌
    return `${n === 5 ? 7 : n - 1}z`;              // 三元牌
  }
  return null;
}

// ===== 牌の並び順（萬→筒→索→字、赤5は5.5扱い） =====

const SUIT_ORDER = { m: 0, p: 1, s: 2, z: 3 };

export function compareTiles(a, b) {
  const suitA = a.slice(-1), suitB = b.slice(-1);
  if (suitA !== suitB) return SUIT_ORDER[suitA] - SUIT_ORDER[suitB];
  const nA = a[0] === '0' ? 5.5 : parseInt(a[0], 10);
  const nB = b[0] === '0' ? 5.5 : parseInt(b[0], 10);
  return nA - nB;
}

export function sortTiles(tiles) {
  return [...tiles].sort(compareTiles);
}

// ===== 数牌種類ランダム入れ替え =====

const SUIT_PERMUTATIONS = [
  ['m','p','s'], ['m','s','p'],
  ['p','m','s'], ['p','s','m'],
  ['s','m','p'], ['s','p','m'],
];

export function randomSuitMap() {
  const perm = SUIT_PERMUTATIONS[Math.floor(Math.random() * 6)];
  return { m: perm[0], p: perm[1], s: perm[2] };
}

function remapTile(tile, suitMap) {
  if (!tile) return tile;
  const suit = tile.slice(-1);
  if (!suitMap[suit]) return tile;
  return tile[0] + suitMap[suit];
}

function remapAnswer(answer, suitMap) {
  if (!answer) return answer;
  if (answer.startsWith('ankan:')) return `ankan:${remapTile(answer.slice(6), suitMap)}`;
  return remapTile(answer, suitMap);
}

export function remapProblem(problem, suitMap) {
  const t = tile => remapTile(tile, suitMap);
  const ts = tiles => tiles ? tiles.map(t) : tiles;
  return {
    ...problem,
    tiles: ts(problem.tiles),
    answer: remapAnswer(problem.answer, suitMap),
    dora: t(problem.dora),
    melds: problem.melds
      ? problem.melds.map(meld => ({ ...meld, tiles: ts(meld.tiles) }))
      : problem.melds,
    discardedTile: t(problem.discardedTile),
    nakiChoices: problem.nakiChoices
      ? problem.nakiChoices.map(c => ({ ...c, tile: t(c.tile) }))
      : problem.nakiChoices,
    explanation: problem.explanation
      ? problem.explanation.replace(/\[([0-9][mps])\]/g, (_, code) => `[${t(code)}]`)
      : problem.explanation,
    note: problem.note
      ? problem.note.replace(/\[([0-9][mps])\]/g, (_, code) => `[${t(code)}]`)
      : problem.note,
    otherDiscard: problem.otherDiscard
      ? { ...problem.otherDiscard, tiles: ts(problem.otherDiscard.tiles) }
      : problem.otherDiscard,
  };
}
