import { CapacitorHttp } from "@capacitor/core";

/** Évite les requêtes auth Supabase bloquées indéfiniment sur simulateur iOS. */
const CAPACITOR_HTTP_TIMEOUT_MS = 25_000;

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

async function resolveBody(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | undefined> {
  if (init?.body != null) {
    if (typeof init.body === "string") return init.body;
    if (init.body instanceof URLSearchParams) return init.body.toString();
    if (init.body instanceof ArrayBuffer) return new TextDecoder().decode(init.body);
    if (ArrayBuffer.isView(init.body)) {
      return new TextDecoder().decode(init.body as ArrayBufferView);
    }
    return String(init.body);
  }
  if (input instanceof Request && input.method !== "GET" && input.method !== "HEAD") {
    return await input.clone().text();
  }
  return undefined;
}

function resolveHeaders(input: RequestInfo | URL, init?: RequestInit): Record<string, string> {
  if (init?.headers) return headersToRecord(init.headers);
  if (input instanceof Request) return headersToRecord(input.headers);
  return {};
}

function statusMustNotHaveBody(status: number, method: string): boolean {
  if (method === "HEAD") return true;
  return status === 204 || status === 205 || status === 304;
}

function bodyFromCapacitorResponse(status: number, method: string, data: unknown): BodyInit | null {
  if (statusMustNotHaveBody(status, method)) return null;
  if (typeof data === "string") return data;
  if (data != null) return JSON.stringify(data);
  return "";
}

/** Native HTTP for Supabase — bypasses WKWebView CORS (Load failed / status 0). */
export const capacitorFetch: typeof fetch = async (input, init = {}) => {
  const url = resolveUrl(input);
  const method = resolveMethod(input, init);
  const headers = resolveHeaders(input, init);
  const data = await resolveBody(input, init);

  let response: Awaited<ReturnType<typeof CapacitorHttp.request>>;
  try {
    response = await Promise.race([
      CapacitorHttp.request({
        url,
        method,
        headers,
        ...(data !== undefined ? { data } : {}),
      }),
      new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error("CapacitorHttp request timeout")),
          CAPACITOR_HTTP_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[CapacitorHttp] request failed", { method, url: url.slice(0, 96), msg });
    throw e;
  }

  const status = response.status;

  return new Response(bodyFromCapacitorResponse(status, method, response.data), {
    status,
    headers: response.headers as HeadersInit,
  });
};
