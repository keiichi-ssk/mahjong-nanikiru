import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        // 清一色道場は認証不要の公開ページなので本番ビルドに含める（admin.html は意図的に除外）
        chinitsu: './chinitsu.html',
      },
    },
  },
  test: {
    // .trash は削除したファイルの退避先。中のテストを拾うと、退避しただけで npm test が壊れる
    exclude: [...configDefaults.exclude, '.trash/**'],
  },
})
