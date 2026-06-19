import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const PROBLEMS_PATH = path.resolve('./src/data/problems.json')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'problems-api',
      configureServer(server) {
        server.middlewares.use('/api/problems', (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (req.method === 'GET') {
            res.end(fs.readFileSync(PROBLEMS_PATH, 'utf-8'))
            return
          }

          if (req.method === 'PUT') {
            const chunks = []
            req.on('data', chunk => chunks.push(chunk))
            req.on('end', () => {
              const body = Buffer.concat(chunks).toString('utf-8')
              fs.writeFileSync(PROBLEMS_PATH, body, 'utf-8')
              res.statusCode = 200
              res.end(JSON.stringify({ ok: true }))
            })
            return
          }

          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
        })
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
})
