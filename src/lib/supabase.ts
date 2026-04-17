import { createClient } from '@supabase/supabase-js'
import { env, hasSupabaseEnv } from './env'

const fallbackUrl = 'https://missing-supabase-url.local'
const fallbackAnonKey = 'missing-supabase-anon-key'

if (!hasSupabaseEnv) {
  console.error('[SPLove env] Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Check Docker/Render env config.')
}

export const supabase = createClient(env.supabaseUrl ?? fallbackUrl, env.supabaseAnonKey ?? fallbackAnonKey)

/**
 * Table Postgres des messages de chat (match / conversation).
 * Aligné sur le schéma Supabase live (`messages` + `conversation_id`).
 * Ancien nom local des migrations : conversation_messages.
 */
export const CHAT_MESSAGES_TABLE = 'messages'

export function logSupabaseTableError(
  table: string,
  operation: 'select' | 'insert' | 'update' | 'delete',
  error: { message?: string; details?: string; hint?: string; code?: string } | null,
): void {
  console.error('[SPLove Supabase]', { table, operation, message: error?.message ?? null, code: error?.code ?? null })
}
