const express = require("express");
const { timingSafeEqual } = require("node:crypto");
const { Environment, SignedDataVerifier } = require("@apple/app-store-server-library");

const rootCa = process.env.APPLE_ROOT_CA_G3_BASE64?.trim();
const secret = process.env.APPLE_UNDO_VERIFIER_SECRET?.trim();

if (!rootCa || !secret || secret.length < 32) {
  throw new Error("Missing certificate or verifier secret");
}

const verifier = new SignedDataVerifier(
  [Buffer.from(rootCa, "base64")],
  true,
  Environment.SANDBOX,
  "com.splove.app",
);
const expectedAuthorization = Buffer.from(`Bearer ${secret}`);
const app = express();

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/verify", (req, res, next) => {
  const authorization = Buffer.from(req.get("authorization") || "");
  if (
    authorization.length !== expectedAuthorization.length ||
    !timingSafeEqual(authorization, expectedAuthorization)
  ) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}, express.json({ limit: "32kb" }), async (req, res) => {
  const { jwsRepresentation, userId } = req.body ?? {};
  if (
    typeof jwsRepresentation !== "string" ||
    !jwsRepresentation.trim() ||
    typeof userId !== "string" ||
    !userId.trim()
  ) {
    return res.status(400).json({ error: "invalid_request" });
  }

  try {
    const tx = await verifier.verifyAndDecodeTransaction(jwsRepresentation.trim());
    if (
      tx.productId !== "splove_undo_1" ||
      tx.type !== "Consumable" ||
      tx.quantity !== 1 ||
      !tx.transactionId ||
      tx.revocationDate != null ||
      tx.appAccountToken?.toLowerCase() !== userId.toLowerCase()
    ) {
      return res.status(422).json({ error: "invalid_undo_purchase" });
    }

    return res.json({ transactionId: tx.transactionId });
  } catch (error) {
    console.warn("[apple-undo] verification rejected", {
      status: typeof error?.status === "number" ? error.status : null,
      causeCode: typeof error?.cause?.code === "string" ? error.cause.code : null,
    });
    return res.status(422).json({ error: "apple_verification_failed" });
  }
});

app.listen(Number(process.env.PORT || 10000), "0.0.0.0");
