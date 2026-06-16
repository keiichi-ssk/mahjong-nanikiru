const BASE_URL =
  'https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular/';

const TILE_NAME_MAP = {
  '1m': 'Man1', '2m': 'Man2', '3m': 'Man3', '4m': 'Man4', '5m': 'Man5', '0m': 'Man5-Dora',
  '6m': 'Man6', '7m': 'Man7', '8m': 'Man8', '9m': 'Man9',
  '1p': 'Pin1', '2p': 'Pin2', '3p': 'Pin3', '4p': 'Pin4', '5p': 'Pin5', '0p': 'Pin5-Dora',
  '6p': 'Pin6', '7p': 'Pin7', '8p': 'Pin8', '9p': 'Pin9',
  '1s': 'Sou1', '2s': 'Sou2', '3s': 'Sou3', '4s': 'Sou4', '5s': 'Sou5', '0s': 'Sou5-Dora',
  '6s': 'Sou6', '7s': 'Sou7', '8s': 'Sou8', '9s': 'Sou9',
  '1z': 'Ton', '2z': 'Nan', '3z': 'Shaa', '4z': 'Pei',
  '5z': 'Haku', '6z': 'Hatsu', '7z': 'Chun',
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
