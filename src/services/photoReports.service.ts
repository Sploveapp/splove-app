import { supabase } from "../lib/supabase";
import type { PhotoReportReasonValue } from "../constants/photoReports";

export async function createPhotoReport(params: {
  reporterUserId: string;
  reportedUserId: string;
  photoSlot: 1 | 2;
  reason: PhotoReportReasonValue;
  comment?: string | null;
}): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from("photo_reports").insert({
    reporter_user_id: params.reporterUserId,
    reported_user_id: params.reportedUserId,
    photo_slot: params.photoSlot,
    reason: params.reason,
    comment: params.comment?.trim() || null,
    status: "open",
  });
  return { error: error ? { message: error.message } : null };
}
