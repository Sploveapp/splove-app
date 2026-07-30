import { Capacitor } from "@capacitor/core";
import { isNativeCapacitorApp } from "./authRedirect";
import { computeIconBadgeCount } from "./iconBadgeCount";
import { setNativeIconBadgeCount } from "./nativeShellBridge";

function isNativeIosApp(): boolean {
  return isNativeCapacitorApp() && Capacitor.getPlatform() === "ios";
}

/** Met à jour le badge rouge de l’icône iOS (0 = efface). */
export async function syncNativeIconBadge(userId: string): Promise<void> {
  if (!userId || !isNativeIosApp()) return;
  const count = await computeIconBadgeCount(userId);
  setNativeIconBadgeCount(count);
}

/** Efface le badge icône (déconnexion). */
export function clearNativeIconBadge(): void {
  if (!isNativeIosApp()) return;
  setNativeIconBadgeCount(0);
}
