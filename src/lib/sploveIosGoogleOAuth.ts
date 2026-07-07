import { Capacitor, registerPlugin } from "@capacitor/core";
import { isGoogleOAuthNativePlatform } from "./authRedirect";

function isIosNativeGoogleOAuth(): boolean {
  if (!isGoogleOAuthNativePlatform()) return false;
  const platform = Capacitor.getPlatform();
  if (platform === "ios") return true;
  if (platform === "android") return false;
  return (
    Capacitor.isNativePlatform() &&
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

export type SploveIosGoogleOAuthOpenResult = {
  outcome: "callback" | "canceled";
  url?: string;
};

export interface SploveIosGoogleOAuthPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  openGoogleOAuth(options: { url: string }): Promise<SploveIosGoogleOAuthOpenResult>;
  showConnectingMask(): Promise<void>;
  showFinalizingMask(): Promise<void>;
  hideOAuthMask(): Promise<void>;
}

const SploveIosGoogleOAuth = registerPlugin<SploveIosGoogleOAuthPlugin>("SploveIosGoogleOAuth", {
  web: () => import("./sploveIosGoogleOAuth.web").then((m) => new m.SploveIosGoogleOAuthWeb()),
});

export async function isSploveIosGoogleOAuthAvailable(): Promise<boolean> {
  if (!isIosNativeGoogleOAuth()) return false;
  const pluginListed = Capacitor.isPluginAvailable("SploveIosGoogleOAuth");
  console.log("[AUTH] SploveIosGoogleOAuth isPluginAvailable:", pluginListed);
  if (!pluginListed) return false;
  try {
    const { available } = await SploveIosGoogleOAuth.isAvailable();
    return available === true;
  } catch {
    return false;
  }
}

export async function openSploveIosGoogleOAuthSession(
  url: string,
): Promise<SploveIosGoogleOAuthOpenResult> {
  return SploveIosGoogleOAuth.openGoogleOAuth({ url: url.trim() });
}

export async function showSploveIosOAuthConnectingMask(): Promise<void> {
  if (!isIosNativeGoogleOAuth()) return;
  try {
    await SploveIosGoogleOAuth.showConnectingMask();
  } catch {
    /* plugin absent */
  }
}

export async function showSploveIosOAuthFinalizingMask(): Promise<void> {
  if (!isIosNativeGoogleOAuth()) return;
  try {
    await SploveIosGoogleOAuth.showFinalizingMask();
  } catch {
    /* plugin absent */
  }
}

export async function hideSploveIosOAuthMask(): Promise<void> {
  if (!isIosNativeGoogleOAuth()) return;
  try {
    await SploveIosGoogleOAuth.hideOAuthMask();
  } catch {
    /* plugin absent */
  }
}
