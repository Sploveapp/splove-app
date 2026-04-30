import { supabase } from "./supabase";

export type AnalyticsVariant = "A" | "B";

/** ID stable du test A/B wording “Seconde chance” vs “Revoir ce profil”. */
export const SECOND_CHANCE_COPY_TEST = "second_chance_copy_v1";

export function getAbVariant(userId: string | null | undefined, testName: string): AnalyticsVariant {
  const seed = `${userId || "anonymous"}:${testName}`;
  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return total % 2 === 0 ? "A" : "B";
}

export async function trackEvent({
  userId,
  eventName,
  testName,
  variant,
  metadata = {},
}: {
  userId?: string | null;
  eventName: string;
  testName?: string | null;
  variant?: AnalyticsVariant | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { error } = await supabase.from("analytics_events").insert({
      user_id: userId ?? null,
      event_name: eventName,
      test_name: testName ?? null,
      variant: variant ?? null,
      metadata,
    });

    if (error) {
      console.warn("[analytics] trackEvent failed", error);
    }
  } catch (error) {
    console.warn("[analytics] trackEvent exception", error);
  }
}
