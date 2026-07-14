#!/usr/bin/env node
/**
 * Génère un client secret JWT Apple (ES256) pour Supabase OAuth.
 * Usage : node scripts/generate-apple-oauth-jwt.mjs [chemin/AuthKey_XXXX.p8]
 *
 * Affiche uniquement le token sur stdout (6 mois / 180 jours).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEAM_ID = "7M3K9F9MCQ";
const KEY_ID = "8F2V725Q96";
const CLIENT_ID = "com.splove.app.auth";
const AUDIENCE = "https://appleid.apple.com";
const VALIDITY_DAYS = 180;

const defaultKeyPath = path.join(os.homedir(), "Downloads", "AuthKey_8F2V725Q96.p8");
const keyPath = path.resolve(process.argv[2] ?? defaultKeyPath);

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function readPrivateKey(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Clé introuvable : ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, "utf8");
}

function signEs256Jwt(privateKeyPem, header, payload) {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKeyPem,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
}

const privateKey = readPrivateKey(keyPath);
const now = Math.floor(Date.now() / 1000);

const token = signEs256Jwt(
  privateKey,
  { alg: "ES256", kid: KEY_ID, typ: "JWT" },
  {
    iss: TEAM_ID,
    iat: now,
    exp: now + VALIDITY_DAYS * 24 * 60 * 60,
    aud: AUDIENCE,
    sub: CLIENT_ID,
  },
);

process.stdout.write(`${token}\n`);
