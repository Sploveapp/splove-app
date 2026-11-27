import { createClient } from "jsr:@supabase/supabase-js@2";


Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const token = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) {
    return Response.json({ error: "auth_required" }, { status: 401 });
  }

  const { data, error: authError } = await createClient(url, anonKey)
    .auth.getUser(token);
  const userId = data.user?.id;
  if (authError || !userId) {
    return Response.json({ error: "invalid_session" }, { status: 401 });
  }

  const testerId = Deno.env.get("APPLE_UNDO_SANDBOX_TEST_USER_ID");
  if (!testerId || userId !== testerId) {
    return Response.json({ error: "sandbox_not_enabled" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  const verifierUrl = Deno.env.get("APPLE_UNDO_VERIFIER_URL")?.trim();
  const verifierSecret = Deno.env.get("APPLE_UNDO_VERIFIER_SECRET")?.trim();
  if (!verifierUrl || !verifierSecret) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  if (body?.action === "preflight") {
    return Response.json({ ok: true });
  }
  const jws = body?.jwsRepresentation;
  if (typeof jws !== "string" || !jws.trim()) {
    return Response.json({ error: "missing_jws" }, { status: 400 });
  }

  let transactionId: string;
  try {
    const verification = await fetch(verifierUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${verifierSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jwsRepresentation: jws.trim(), userId }),
      redirect: "error",
      signal: AbortSignal.timeout(75_000),
    });

    if (!verification.ok) {
      console.warn("[apple-undo] verifier HTTP status", verification.status);
      if (verification.status === 422) {
        return Response.json({ error: "apple_verification_failed" }, { status: 422 });
      }
      return Response.json({ error: "apple_verifier_unavailable" }, { status: 502 });
    }

    const verified = await verification.json();
    if (typeof verified?.transactionId !== "string" || !verified.transactionId.trim()) {
      return Response.json({ error: "invalid_verifier_response" }, { status: 502 });
    }
    transactionId = verified.transactionId;
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      && typeof error.status === "number" ? error.status : null;
    const reason = error instanceof Error
      && ["apple_root_ca_missing", "invalid_undo_purchase"].includes(error.message)
      ? error.message : null;
      const cause = error instanceof Error ? error.cause : undefined;
      const causeCode =
        cause && typeof cause === "object" && "code" in cause &&
        typeof cause.code === "string" ? cause.code : null;

      console.warn("[apple-undo] verification rejected", {
        name: error instanceof Error ? error.name : "unknown",
        status,
        reason,
        causeName: cause instanceof Error ? cause.name : null,
        causeCode,
      });
    return Response.json({ error: "apple_verification_failed" }, { status: 422 });
  }

  const { data: granted, error } = await createClient(url, serviceKey)
    .rpc("splove_grant_apple_undo_sandbox", {
      p_user_id: userId,
      p_transaction_id: transactionId,
    });

  if (error || typeof granted !== "boolean") {
    return Response.json({ error: "credit_failed" }, { status: 500 });
  }

  return Response.json({ ok: true, alreadyCredited: !granted });
});
