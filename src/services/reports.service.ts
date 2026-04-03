import { supabase } from "../lib/supabase";
import type { ReportReasonValue } from "../constants/safety";

export type CreateReportInput = {
  reporterId: string;
  reportedProfileId: string;
  reason: ReportReasonValue;
  details?: string | null;
};

/**
 * Creates a report. Caller must ensure reporterId = auth.uid() (RLS enforces it).
 */
export async function createReport(input: CreateReportInput): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("reports").insert({
    reporter_id: input.reporterId,
    reported_id: input.reportedProfileId,
    reason: input.reason,
    details: input.details ?? null,
  });
  return { error: error ?? null };
}
