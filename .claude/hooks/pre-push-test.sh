#!/bin/bash
# PreToolUse hook: git push を含むコマンドの実行前に npm test を走らせ、
# 失敗したら exit 2 で push をブロックする。
# stdin にはツール呼び出しの JSON が渡される（jq 不使用・文字列マッチで判定）。

input=$(cat)

case "$input" in
*"git push"*)
    log="${TEMP:-/tmp}/claude-prepush-test.log"
    # 環境起因のフレーク（Vitestがまれに起動直後に落ちる）対策で、失敗時は1回だけ再試行する
    if ! npm test -- --run >"$log" 2>&1 && ! npm test -- --run >"$log" 2>&1; then
        {
            echo "npm test が失敗したため git push をブロックしました。テストを修正してから再度 push してください。"
            echo "--- テストログ（末尾30行） ---"
            tail -30 "$log"
        } >&2
        exit 2
    fi
    ;;
esac

exit 0
