import { supabase } from "../lib/supabase";
import type { ModeratePhotoResponse } from "../types/photoModeration.types";

export async function invokeModeratePhoto(params: {
  userId: string;
  photoSlot: 1 | 2;
  storagePath: string;
}): Promise<{ data: ModeratePhotoResponse | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke<ModeratePhotoResponse>("moderate-photo", {
      body: {
        user_id: params.userId,
        photo_slot: params.photoSlot,
        storage_path: params.storagePath,
      },
    });
    if (error) {
      return { data: null, error: new Error(error.message || "moderate-photo_failed") };
    }
    if (data && typeof (data as { error?: string }).error === "string") {
      const e = (data as { error?: string; detail?: string }).error;
      const d = (data as { detail?: string }).detail;
      return { data: null, error: new Error(d ? `${e}: ${d}` : e) };
    }
    return { data: data ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("moderate-photo_failed") };
  }
}
