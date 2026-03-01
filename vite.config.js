import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'serve-test-wok-page',
      configureServer(server) {
        const publicDir = path.resolve(server.config.root, server.config.publicDir || 'public')
        const testPagePath = path.join(publicDir, 'test-wok-svg.html')
        const serveTestPage = (req, res, next) => {
          const pathname = req.url?.split('?')[0] || ''
          if (pathname !== '/test-wok-svg.html') return next()
          if (!fs.existsSync(testPagePath)) return next()
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(fs.readFileSync(testPagePath, 'utf-8'))
        }
        server.middlewares.use(serveTestPage)
        const stack = server.middlewares.stack
        if (Array.isArray(stack) && stack.length > 0) {
          const ourHandler = stack.pop()
          stack.unshift(ourHandler)
        }
      },
    },
    react(),
    {
      name: 'redirect-test-wok-htm',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/test-wok-svg.htm' || req.url === '/test-wok-svg.htm/') {
            res.writeHead(302, { Location: '/test-wok-svg.html' })
            res.end()
            return
          }
          next()
        })
      },
    },
  ],
})
