/**
 * Copie Deno de src/lib/accountDeletionStoragePurgeAuth.ts
 */

export type StoragePurgeAuthResult = "ok" | "server_misconfigured" | "unauthorized";

function trimHeader(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function bearerCredential(authorizationHeader: string | null | undefined): string {
  const raw = trimHeader(authorizationHeader);
  const prefix = "Bearer ";
  if (raw.length < prefix.length) return "";
  if (raw.slice(0, prefix.length).toLowerCase() !== "bearer ") return "";
  return raw.slice(prefix.length).trim();
}

function timingSafeEqual(left: string, right: string): boolean {
  const max = Math.max(left.length, right.length);
  if (max === 0) return false;
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < max; i += 1) {
    const a = i < left.length ? left.charCodeAt(i) : 0;
    const b = i < right.length ? right.charCodeAt(i) : 0;
    mismatch |= a ^ b;
  }
  return mismatch === 0;
}

export function authorizeAccountDeletionStoragePurge(input: {
  authorizationHeader?: string | null;
  apikeyHeader?: string | null;
  serviceRoleKey: string;
  anonKey?: string | null;
}): StoragePurgeAuthResult {
  const serviceRoleKey = trimHeader(input.serviceRoleKey);
  if (!serviceRoleKey) return "server_misconfigured";

  const presented = [bearerCredential(input.authorizationHeader), trimHeader(input.apikeyHeader)].filter(
    (value) => value.length > 0,
  );
  if (presented.length === 0) return "unauthorized";

  const anonKey = trimHeader(input.anonKey);
  if (anonKey && presented.every((value) => timingSafeEqual(value, anonKey))) {
    return "unauthorized";
  }

  if (presented.some((value) => timingSafeEqual(value, serviceRoleKey))) {
    return "ok";
  }
  return "unauthorized";
}
