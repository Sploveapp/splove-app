import { supabase } from "../lib/supabase";
import {
  computeProfileCompletionFlags,
  type ProfileCompletionInput,
} from "../lib/profileCompletion";

type SaveProfilePayload = ProfileCompletionInput & {
  id: string;
  [key: string]: unknown;
};

export async function saveProfileWithComputedCompletion(
  payload: SaveProfilePayload
) {
  const { id, ...fields } = payload;

  // 🔐 On sécurise les inputs pour le calcul
  const completionInput: ProfileCompletionInput = {
    first_name:
      typeof fields.first_name === "string" ? fields.first_name : null,
    birth_date:
      typeof fields.birth_date === "string" ? fields.birth_date : null,
    gender: typeof fields.gender === "string" ? fields.gender : null,
    interested_in:
      typeof fields.interested_in === "string"
        ? fields.interested_in
        : null,
    intent: typeof fields.intent === "string" ? fields.intent : null,
    sports: Array.isArray(fields.sports)
      ? (fields.sports as string[])
      : null,
    main_photo_url:
      typeof fields.main_photo_url === "string"
        ? fields.main_photo_url
        : null,
  };

  // 🧠 Calcul des flags (SOURCE OF TRUTH)
  const { onboarding_completed, profile_completed } =
    computeProfileCompletionFlags(completionInput);

  // 📦 Payload final
  const updatePayload = {
    ...fields,
    onboarding_completed,
    profile_completed,
    updated_at: new Date().toISOString(),
  };

  // 🚀 Update Supabase
  const { data, error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[saveProfileWithComputedCompletion] error", error);
    throw error;
  }

  return data;
}