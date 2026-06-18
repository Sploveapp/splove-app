function trimEnv(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v || undefined;
}

export const env = {
  supabaseUrl: trimEnv(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: trimEnv(import.meta.env.VITE_SUPABASE_ANON_KEY),
  appEnv: import.meta.env.VITE_APP_ENV ?? "local",
  veriffPublicKey: import.meta.env.VITE_VERIFF_PUBLIC_KEY ?? null,
  googleIosClientId: trimEnv(import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID),
  googleWebClientId: trimEnv(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID),
} as const;

export const hasSupabaseEnv = Boolean(env.supabaseUrl && env.supabaseAnonKey);

export const hasGoogleNativeIosEnv = Boolean(env.googleIosClientId && env.googleWebClientId);
