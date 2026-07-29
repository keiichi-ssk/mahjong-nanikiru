#!/usr/bin/env bash
# 動的OGPカード（api/og.js・api/og-problem.js）が使うフォントを作り直す。
#
# カードは Edge Runtime 上の satori でレンダリングするため、フォントを関数に同梱する必要がある。
# Noto Sans CJK JP は1書体17MBあり Vercel 関数の同梱サイズ上限に触れるので、
# **カードで実際に描く文字だけ**に絞ったサブセットを public/fonts/ に置いている。
#
# ★ カードの文言を増やしたら、下の CHARS に文字を足してこのスクリプトを実行し直すこと。
#   含まれない文字は豆腐（□）になる。CLAUDE.md の文字一覧も一緒に更新する。
#
# 必要なもの: Python + fonttools（pip install fonttools）、curl
# 使い方: bash scripts/subset-og-fonts.sh

set -euo pipefail

# カードで描く文字（重複していてもよい）。
#   数字・空白        … 点数・巡目・局・カードの共通部分
#   ちってのるを…     … api/og.js（メンチン何切るドリル）の文言
#   一何切待清特色訓？ … 同上＋api/og-problem.js の「何を切る？」
#   東南西北局本場巡目供託点, … api/og-problem.js の卓上の状況表示（2026-07-29 追加）
#   座学す麻雀問集自分で作|()myβ … api/og-problem.js の右側のサイト名とサブテキスト
#                                   「座学する麻雀 / 何切る問題集 | メンチン何切るドリル /
#                                     自分で作る my問題集(β)」（2026-07-29 追加）
CHARS=' 0123456789ちってのるをチドメリルン一何切待清特色訓？東南西北局本場巡目供託点,座学す麻雀問集自分で作|()myβ'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/public/fonts"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 素材は notofonts/noto-cjk の**静的**OTF（OFL）。
# ★ Google Fonts 配布の可変フォント（variable font）は使えない
#   —— satori が fvar テーブルの解析に失敗する既知の問題がある
BASE_URL='https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Japanese'

for weight in Bold Regular; do
  src="$TMP_DIR/NotoSansCJKjp-$weight.otf"
  echo "downloading NotoSansCJKjp-$weight.otf ..."
  curl -sL -o "$src" "$BASE_URL/NotoSansCJKjp-$weight.otf"

  echo "subsetting -> public/fonts/NotoSansJP-$weight.otf"
  python -m fontTools.subset "$src" \
    --text="$CHARS" \
    --output-file="$OUT_DIR/NotoSansJP-$weight.otf" \
    --layout-features='' \
    --no-hinting \
    --desubroutinize \
    --drop-tables+=DSIG
done

ls -l "$OUT_DIR"
