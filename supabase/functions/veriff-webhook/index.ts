// Veriff désactivé — webhook en no-op (aucune validation HMAC ni appel BDD lié à Veriff).

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  return new Response(JSON.stringify({ received: true, disabled: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
