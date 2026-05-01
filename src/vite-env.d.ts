/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_APP_ENV?: string
    readonly VITE_BETA_MODE?: string
  
    readonly DEV: boolean
    readonly PROD: boolean
    readonly MODE: string
    readonly BASE_URL: string
    readonly SSR: boolean
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }