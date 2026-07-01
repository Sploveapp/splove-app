#!/usr/bin/env node
/**
 * Ajoute le URL scheme Google Sign-In inversé dans ios/App/App/Info.plist.
 * Lit VITE_GOOGLE_IOS_CLIENT_ID depuis .env à la racine.
 *
 * Exemple : 123456789-abc.apps.googleusercontent.com
 *   → com.googleusercontent.apps.123456789-abc
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const plistPath = join(root, "ios/App/App/Info.plist");

function readEnvValue(key) {
  if (!existsSync(envPath)) return undefined;
  const content = readFileSync(envPath, "utf8");
  const line = content
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row.startsWith(`${key}=`) && !row.startsWith("#"));
  if (!line) return undefined;
  const raw = line.slice(key.length + 1).trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function reversedGoogleScheme(iosClientId) {
  const trimmed = iosClientId.trim();
  const match = trimmed.match(/^([\w-]+)\.apps\.googleusercontent\.com$/i);
  if (!match) return null;
  return `com.googleusercontent.apps.${match[1]}`;
}

function ensureSchemeInPlist(plist, scheme) {
  const marker = "<key>CFBundleURLTypes</key>";
  if (!plist.includes(marker)) {
    console.warn("[configure-google-ios] CFBundleURLTypes absent — ajout manuel requis dans Xcode");
    return plist;
  }

  if (plist.includes(`<string>${scheme}</string>`)) {
    return plist;
  }

  const googleBlock = `		<dict>
			<key>CFBundleURLName</key>
			<string>com.splove.app.google-signin</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${scheme}</string>
			</array>
		</dict>`;

  const closingArray = plist.indexOf("</array>", plist.indexOf(marker));
  if (closingArray === -1) {
    console.warn("[configure-google-ios] impossible de parser Info.plist");
    return plist;
  }

  return `${plist.slice(0, closingArray)}${googleBlock}\n${plist.slice(closingArray)}`;
}

const iosClientId = readEnvValue("VITE_GOOGLE_IOS_CLIENT_ID");
if (!iosClientId) {
  console.log("[configure-google-ios] skip — VITE_GOOGLE_IOS_CLIENT_ID absent dans .env");
  process.exit(0);
}

const scheme = reversedGoogleScheme(iosClientId);
if (!scheme) {
  console.warn("[configure-google-ios] skip — format Client ID iOS invalide:", iosClientId);
  process.exit(0);
}

if (!existsSync(plistPath)) {
  console.warn("[configure-google-ios] skip — Info.plist introuvable:", plistPath);
  process.exit(0);
}

const plist = readFileSync(plistPath, "utf8");
const next = ensureSchemeInPlist(plist, scheme);
if (next === plist) {
  console.log("[configure-google-ios] URL scheme déjà présent:", scheme);
} else {
  writeFileSync(plistPath, next, "utf8");
  console.log("[configure-google-ios] URL scheme ajouté:", scheme);
}
