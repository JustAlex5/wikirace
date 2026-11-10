/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * BASE_PATH lets the same build work for any GitHub Pages project
 * repository (e.g. "/my-repo/") without hardcoding its name. The deploy
 * workflow sets it from actions/configure-pages; locally it defaults to "/".
 */
function resolveBase(): string {
  const raw = process.env.BASE_PATH?.trim()
  if (!raw) return '/'
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['src/**/*.live.test.ts', 'node_modules/**'],
  },
})
