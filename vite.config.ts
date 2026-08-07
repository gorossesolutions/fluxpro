/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // supabase/functions/** runs on Deno, not Vitest/Node — it uses Deno.test and Deno globals.
    // Verify that directory with `deno test`/`deno check` instead (see docs/EDGE_FUNCTIONS.md).
    // Full list minus 'supabase/functions/**' is Vitest's own default exclude — re-specifying
    // `exclude` overrides it entirely, so those defaults are repeated here rather than lost.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'supabase/functions/**',
    ],
  },
})
