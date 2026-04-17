export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  appEnv: import.meta.env.VITE_APP_ENV ?? "local",
  veriffPublicKey: import.meta.env.VITE_VERIFF_PUBLIC_KEY ?? null,
} as const;

export const hasSupabaseEnv = Boolean(env.supabaseUrl && env.supabaseAnonKey);

