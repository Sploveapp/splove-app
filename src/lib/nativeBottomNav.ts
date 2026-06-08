import { Capacitor } from "@capacitor/core";

/** Barre d’onglets native iOS (SwiftUI `BottomNavigationBar`) — masquer la barre React dupliquée. */
export function usesNativeBottomNavigation(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/** Host modale / sheet — clearance basse dynamique (barre native + safe area). */
export function modalSheetHostClass(): string {
  return "splove-modal-sheet-host";
}

/** Sheet profil — max-height dynamique au-dessus de la barre native et safe areas. */
export function profileSheetClass(): string {
  return "splove-profile-sheet";
}
