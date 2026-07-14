import { Capacitor } from "@capacitor/core";

/** Retour haptique — UIImpactFeedbackGenerator natif iOS, fallback Vibration API. */
export function triggerSploveHeartHaptic(premium = false): void {
  void triggerSploveHeartHapticAsync(premium);
}

/** Pop de sélection Play — impact un peu plus marqué. */
export function triggerSplovePlaySelectHaptic(): void {
  void triggerSploveHeartHapticAsync(true, "selection");
}

async function triggerSploveHeartHapticAsync(
  premium = false,
  kind: "default" | "selection" = "default",
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      const style =
        kind === "selection"
          ? ImpactStyle.Medium
          : premium
            ? ImpactStyle.Medium
            : ImpactStyle.Light;
      await Haptics.impact({ style });
      return;
    } catch {
      /* plugin indisponible — fallback ci-dessous */
    }
  }

  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(kind === "selection" ? [12, 40, 16] : premium ? [10, 36, 14] : 14);
  } catch {
    /* ignore */
  }
}
