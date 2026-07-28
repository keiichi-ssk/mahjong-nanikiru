import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // .trash は削除したファイルの退避先（復元用に原状のまま置く）なので検査しない。
  // tools-local は外部ツール（Tampermonkey ユーザースクリプト等）のローカル置き場で、
  // GM_xmlhttpRequest / unsafeWindow などブラウザ拡張のグローバルを使うため対象外にする
  globalIgnores(['dist', '.trash', 'tools-local']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Vercel サーバーレス関数は Node.js 実行環境（process 等を使う）
    files: ['api/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
