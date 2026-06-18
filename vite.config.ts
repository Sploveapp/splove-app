import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // Chemins absolus depuis la racine — évite /auth/assets/* sur Render (routes SPA directes).
  // Compatible Capacitor (origin https://localhost/assets/…).
  base: '/',
  plugins: [
    react(),
    {
      name: 'splove-supabase-env-check',
      buildStart() {
        const url = process.env.VITE_SUPABASE_URL?.trim()
        const key = process.env.VITE_SUPABASE_ANON_KEY?.trim()
        if (!url || !key) {
          this.warn(
            '[splove] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absents au build — ' +
              'Capacitor iOS échouera sur setSession (Load failed, status 0). Copiez .env.example → .env',
          )
        } else if (!url.startsWith('https://')) {
          this.warn(`[splove] VITE_SUPABASE_URL doit être https (actuel: ${url.slice(0, 40)}…)`)
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
})
