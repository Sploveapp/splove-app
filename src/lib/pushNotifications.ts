import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type RegistrationError,
  type Token,
} from "@capacitor/push-notifications";
import { isNativeCapacitorApp } from "./authRedirect";
import { navigateFromPushRoute } from "./pushNavigate";
import {
  readPushPayload,
  shouldSuppressForegroundPush,
} from "./pushNotificationRoutes";
import {
  fetchDevicePushTokenStatus,
  upsertDevicePushToken,
  type DeviceTokenPlatform,
} from "../services/deviceTokens.service";
import {
  isProductionPushBuild,
  isPushRegistrationAllowed,
  resolvePushEnvironment,
} from "./pushEnvironment";

const ONBOARDING_PUSH_OFFER_KEY = "splove_push_onboarding_offer_v1";
const LOGIN_PUSH_OFFER_KEY = "splove_push_login_offer_v1";

export type PushPermissionState = "granted" | "denied" | "prompt" | "unsupported";

let listenersAttached = false;
let activeUserId: string | null = null;
let listenerHandles: Array<{ remove: () => Promise<void> }> = [];
let attachListenersPromise: Promise<void> | null = null;
/** Token APNs reçu avant que activeUserId soit prêt (race init / register). */
let pendingPushToken: string | null = null;
let foregroundPathname = "/";

export function setPushForegroundPathname(pathname: string): void {
  foregroundPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function pushPlatform(): DeviceTokenPlatform | null {
  const p = Capacitor.getPlatform();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return null;
}

function isPushSupportedNative(): boolean {
  return isNativeCapacitorApp() && pushPlatform() !== null;
}

function logPush(event: string, detail?: Record<string, unknown>): void {
  if (isProductionPushBuild() && !import.meta.env.DEV) return;
  if (detail) console.log(event, detail);
  else console.log(event);
}

function readRouteFromPayload(notification: PushNotificationSchema): string | null {
  return readPushPayload(notification).route;
}

async function persistToken(userId: string, token: string): Promise<void> {
  const platform = pushPlatform();
  if (!platform) return;

  if (!isPushRegistrationAllowed()) {
    logPush("PUSH_TOKEN_SKIPPED", {
      reason: "registration_disabled_in_development",
      pushEnvironment: resolvePushEnvironment(),
    });
    return;
  }

  const result = await upsertDevicePushToken(userId, token, platform);
  if (result.ok) {
    pendingPushToken = null;
    logPush("PUSH_TOKEN_SAVED", { platform, userId });
  } else {
    console.warn("PUSH_TOKEN_SAVED", {
      ok: false,
      error: result.error,
      code: result.code,
      details: result.details,
      platform,
      userId,
    });
  }
}

async function flushPendingPushToken(): Promise<void> {
  const uid = activeUserId;
  const token = pendingPushToken;
  if (!uid || !token) return;
  await persistToken(uid, token);
}

async function attachPushListenersOnce(userId: string): Promise<void> {
  if (!isPushSupportedNative()) return;
  activeUserId = userId;

  if (listenersAttached) {
    await flushPendingPushToken();
    return;
  }

  const onRegistration = await PushNotifications.addListener("registration", async (ev: Token) => {
    logPush("PUSH_TOKEN_RECEIVED", {
      platform: pushPlatform(),
      tokenLength: ev.value?.length ?? 0,
    });
    const uid = activeUserId;
    if (!ev.value?.trim()) {
      console.warn("[push] registration event without token value");
      return;
    }
    if (!uid) {
      pendingPushToken = ev.value;
      console.warn("[push] PUSH_TOKEN_RECEIVED but no activeUserId — token queued for retry");
      return;
    }
    await persistToken(uid, ev.value);
  });

  const onRegistrationError = await PushNotifications.addListener(
    "registrationError",
    (err: RegistrationError) => {
      console.warn("[push] registrationError", {
        error: err?.error ?? "registration_error",
      });
    },
  );

  const onReceived = await PushNotifications.addListener(
    "pushNotificationReceived",
    (notification: PushNotificationSchema) => {
      const payload = readPushPayload(notification);
      if (shouldSuppressForegroundPush(foregroundPathname, payload)) {
        logPush("PUSH_NOTIFICATION_SUPPRESSED_FOREGROUND", {
          pathname: foregroundPathname,
          kind: payload.kind,
        });
        return;
      }
      logPush("PUSH_NOTIFICATION_RECEIVED", {
        id: notification.id ?? null,
        title: notification.title ?? null,
        kind: payload.kind,
      });
    },
  );

  const onAction = await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action: ActionPerformed) => {
      const route = readRouteFromPayload(action.notification);
      logPush("PUSH_NOTIFICATION_OPENED", {
        actionId: action.actionId ?? null,
        route: route ?? null,
      });
      if (route) navigateFromPushRoute(route);
    },
  );

  listenerHandles = [onRegistration, onRegistrationError, onReceived, onAction];
  listenersAttached = true;
  await flushPendingPushToken();
}

/** Évite la course init / syncPushTokenIfGranted (register avant addListener). */
function attachPushListeners(userId: string): Promise<void> {
  if (!isPushSupportedNative()) return Promise.resolve();
  activeUserId = userId;
  if (listenersAttached) {
    return flushPendingPushToken();
  }
  if (!attachListenersPromise) {
    attachListenersPromise = attachPushListenersOnce(userId).finally(() => {
      attachListenersPromise = null;
    });
  }
  return attachListenersPromise;
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (!isPushSupportedNative()) return "unsupported";
  const status = await PushNotifications.checkPermissions();
  const receive = status.receive;
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt";
}

/** Idempotent : écouteurs register / received / opened (sans demander la permission). */
export async function initPushNotificationHandlers(userId: string): Promise<void> {
  if (!userId || !isPushSupportedNative()) return;
  await attachPushListeners(userId);
}

/**
 * Demande la permission iOS/Android, enregistre le device auprès d’APNs/FCM
 * et upsert le token dans Supabase.
 */
export async function requestPushNotificationsPermission(
  userId: string,
): Promise<PushPermissionState> {
  if (!userId || !isPushSupportedNative()) return "unsupported";
  if (!isPushRegistrationAllowed()) {
    logPush("PUSH_PERMISSION_SKIPPED", {
      reason: "registration_disabled_in_development",
      pushEnvironment: resolvePushEnvironment(),
    });
    return "unsupported";
  }

  await attachPushListeners(userId);

  logPush("PUSH_PERMISSION_REQUEST", { platform: pushPlatform(), userId });

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt") {
    perm = await PushNotifications.requestPermissions();
  }

  if (perm.receive === "granted") {
    logPush("PUSH_PERMISSION_GRANTED", { platform: pushPlatform() });
    await PushNotifications.register();
    return "granted";
  }

  if (perm.receive === "denied") {
    logPush("PUSH_PERMISSION_DENIED", { platform: pushPlatform() });
    return "denied";
  }

  return "prompt";
}

/** Si la permission est déjà accordée, ré-enregistre le token (retour app / cold start). */
export async function syncPushTokenIfGranted(userId: string): Promise<void> {
  if (!userId || !isPushSupportedNative()) return;
  await attachPushListeners(userId);
  const state = await getPushPermissionState();
  if (state !== "granted") {
    logPush("PUSH_SYNC_SKIPPED", { reason: "permission_not_granted", state });
    return;
  }
  logPush("PUSH_REGISTER_CALL", { userId, platform: pushPlatform() });
  await PushNotifications.register();
  await flushPendingPushToken();
}

async function offerPushNotificationsOnce(
  userId: string,
  storageKey: string,
  delayMs: number,
): Promise<void> {
  if (!userId || !isPushSupportedNative()) return;
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(storageKey) === "1") return;

  const state = await getPushPermissionState();
  if (state === "denied" || state === "granted") {
    localStorage.setItem(storageKey, "1");
    return;
  }

  localStorage.setItem(storageKey, "1");
  window.setTimeout(() => {
    void requestPushNotificationsPermission(userId);
  }, delayMs);
}

/** Une seule proposition automatique après onboarding (permission système). */
export async function offerPushNotificationsAfterOnboarding(userId: string): Promise<void> {
  await offerPushNotificationsOnce(userId, ONBOARDING_PUSH_OFFER_KEY, 1200);
}

/** Proposition après connexion (utilisateurs sans passage onboarding récent). */
export async function offerPushNotificationsAfterLogin(userId: string): Promise<void> {
  if (typeof localStorage !== "undefined" && localStorage.getItem(ONBOARDING_PUSH_OFFER_KEY) === "1") {
    return;
  }
  await offerPushNotificationsOnce(userId, LOGIN_PUSH_OFFER_KEY, 2000);
}

export async function getPushRegistrationSummary(
  userId: string,
): Promise<{ permission: PushPermissionState; savedInDb: boolean }> {
  const permission = await getPushPermissionState();
  const platform = pushPlatform();
  if (!userId || !platform || permission === "unsupported") {
    return { permission, savedInDb: false };
  }
  const { hasToken } = await fetchDevicePushTokenStatus(userId, platform);
  return { permission, savedInDb: hasToken };
}

export async function teardownPushNotificationHandlers(): Promise<void> {
  if (attachListenersPromise) {
    await attachListenersPromise.catch(() => undefined);
  }
  await Promise.all(listenerHandles.map((h) => h.remove().catch(() => undefined)));
  listenerHandles = [];
  listenersAttached = false;
  attachListenersPromise = null;
  activeUserId = null;
  pendingPushToken = null;
}
