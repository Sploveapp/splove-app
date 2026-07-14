/**
 * Redact OAuth tokens, sessions, and PII from console output (Xcode / Safari).
 * Side-effect: installed on first import from bootstrapApp.
 */
import { sanitizeForLog } from "./sanitizeForLog";

function wrapConsoleMethod(method: "log" | "info" | "warn" | "error" | "debug"): void {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    original(...args.map((arg) => sanitizeForLog(arg)));
  };
}

let installed = false;

export function installOAuthSafeConsole(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  wrapConsoleMethod("log");
  wrapConsoleMethod("info");
  wrapConsoleMethod("warn");
  wrapConsoleMethod("error");
  wrapConsoleMethod("debug");
}

installOAuthSafeConsole();
