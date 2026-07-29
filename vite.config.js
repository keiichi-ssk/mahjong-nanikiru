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
        // 自作問題（my問題集）の作成画面。認証必須・実効防御は RLS なので本番に含める。
        // admin.html（公式問題の編集）とは役割が別。詳細は docs/user-problems-plan.md の 5-3
        myproblems: './myproblems.html',
        // 共有された1問を表示するページ。問題の中身は URL に入っており DB を引かない（認証不要）
        share: './share.html',
      },
    },
  },
  test: {
    // .trash は削除したファイルの退避先。中のテストを拾うと、退避しただけで npm test が壊れる
    exclude: [...configDefaults.exclude, '.trash/**'],
  },
})
