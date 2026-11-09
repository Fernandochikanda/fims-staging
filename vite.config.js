// /vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  esbuild: {
    // Drop console.log/warn/error in PRODUCTION builds only to reduce bundle
    // size and prevent info leakage. Dev mode keeps them for debugging.
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor'
            }
            if (id.includes('@supabase')) {
              return 'supabase'
            }
            if (id.includes('recharts')) {
              return 'charts'
            }
            if (id.includes('jspdf')) {
              return 'pdf'
            }
            // Outras dependências
            return 'vendor'
          }
        }
      }
    }
  }
}))
