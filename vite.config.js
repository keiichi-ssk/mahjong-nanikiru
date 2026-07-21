import { defineConfig } from 'vite'
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
})
