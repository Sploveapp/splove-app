import { supabase } from "./supabase";

/**
 * Garantit une ligne `profiles` avec id = `authUserId` (toujours l’UUID Supabase Auth).
 * Ne génère jamais d’UUID aléatoire : `profiles.id` doit rester égal à `auth.users.id`.
 * Appeler après signup et lorsque le SELECT profil ne retourne aucune ligne.
 */
export async function ensureProfileRowForAuthUserId(authUserId: string): Promise<boolean> {
  if (!authUserId) return false;
  const { error } = await supabase.from("profiles").upsert(
    { id: authUserId, profile_completed: false },
    { onConflict: "id" }
  );
  return !error;
}
