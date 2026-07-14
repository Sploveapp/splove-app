import { sanitizeCapacitorBridgePayload } from "./sanitizeForLog";

type CapacitorBridgeResult = {
  callbackId?: string;
  pluginId?: string;
  methodName?: string;
  success?: boolean;
  data?: unknown;
  error?: unknown;
  save?: boolean;
};

let installed = false;

function patchFromNative(cap: { fromNative?: (result: CapacitorBridgeResult) => void }): void {
  const original = cap.fromNative;
  if (!original || (original as { __sploveSanitized?: boolean }).__sploveSanitized) return;

  const wrapped = function sploveSanitizedFromNative(this: unknown, result: CapacitorBridgeResult) {
    const safe: CapacitorBridgeResult = {
      ...result,
      data: result.data !== undefined ? sanitizeCapacitorBridgePayload(result.data) : result.data,
      error: result.error !== undefined ? sanitizeCapacitorBridgePayload(result.error) : result.error,
    };
    return original.call(this, safe);
  };
  (wrapped as { __sploveSanitized?: boolean }).__sploveSanitized = true;
  cap.fromNative = wrapped;
}

function tryInstallOnCapacitorObject(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { fromNative?: (r: CapacitorBridgeResult) => void } })
    .Capacitor;
  if (!cap?.fromNative) return false;
  patchFromNative(cap);
  return true;
}

/**
 * Masque tokens dans Capacitor.fromNative avant que le bridge ne loggue côté WebView.
 * Les logs Xcode « TO JS » sont traités par scripts/patch-capacitor-ios-log-redaction.mjs.
 */
export function installCapacitorBridgeLogSanitizer(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  if (tryInstallOnCapacitorObject()) return;

  const poll = window.setInterval(() => {
    if (tryInstallOnCapacitorObject()) {
      window.clearInterval(poll);
    }
  }, 0);
  window.setTimeout(() => window.clearInterval(poll), 10_000);
}
