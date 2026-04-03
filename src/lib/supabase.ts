import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
