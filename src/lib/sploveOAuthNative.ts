import { Capacitor, registerPlugin } from "@capacitor/core";

export interface SploveOAuthPlugin {
  startWebAuthSession(options: {
    url: string;
    callbackScheme: string;
  }): Promise<{ callbackUrl: string }>;
}

export const SploveOAuth = registerPlugin<SploveOAuthPlugin>("SploveOAuth");

/** iOS ASWebAuthenticationSession — évite SFSafariViewController et le flash Supabase. */
export function isSploveOAuthWebAuthAvailable(): boolean {
  return Capacitor.getPlatform() === "ios";
}
