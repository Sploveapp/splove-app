#!/usr/bin/env node
/**
 * Masque access_token / refresh_token dans les logs natifs Capacitor « TO JS » / « To Native ».
 * Idempotent — relancer après cap sync / pod install.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "// SPLove log redaction";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, "..");
const SWIFT_SANITIZER = readFileSync(
  join(scriptDir, "splove-bridge-log-sanitizer.swift.snippet"),
  "utf8",
).trim();

const REPLACEMENTS = [
  {
    file: "CapacitorBridge.swift",
    from: 'CAPLog.print("⚡️  TO JS", resultJson.prefix(256))',
    to: 'CAPLog.print("⚡️  TO JS", sploveSanitizeBridgeLog(String(resultJson.prefix(4096))))',
  },
  {
    file: "WebViewDelegationHandler.swift",
    from: 'CAPLog.print("To Native Cordova -> ", pluginId, method, callbackId, options)',
    to: 'CAPLog.print("To Native Cordova -> ", pluginId, method, callbackId, sploveSanitizeBridgeLog(String(describing: options)))',
  },
  {
    file: "CAPBridgeProtocol.swift",
    from: 'CAPLog.print("⚡️ ", plugin.pluginId, "-", output)',
    to: 'CAPLog.print("⚡️ ", plugin.pluginId, "-", sploveSanitizeBridgeLog(String(describing: output)))',
  },
];

const searchRoots = [
  join(root, "ios/App/Pods"),
  join(root, "node_modules/@capacitor/ios"),
];

function walkSwiftFiles(dir, filename, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === ".git" || entry === "build") continue;
      walkSwiftFiles(full, filename, out);
    } else if (entry === filename) {
      out.push(full);
    }
  }
  return out;
}

function ensureSanitizer(source) {
  if (source.includes(MARKER)) return source;
  const importLine = "import Foundation";
  if (source.includes(importLine)) {
    return source.replace(importLine, `${importLine}\n\n${SWIFT_SANITIZER}\n`);
  }
  return `${SWIFT_SANITIZER}\n${source}`;
}

let patchedFiles = 0;

for (const { file, from, to } of REPLACEMENTS) {
  const paths = new Set();
  for (const base of searchRoots) {
    for (const path of walkSwiftFiles(base, file)) {
      paths.add(path);
    }
  }
  if (paths.size === 0) {
    console.warn(`[ios-log-redaction] ${file} introuvable — skip`);
    continue;
  }
  for (const path of paths) {
    let source = readFileSync(path, "utf8");
    const before = source;
    source = ensureSanitizer(source);
    if (source.includes(from)) {
      source = source.replace(from, to);
    } else if (!source.includes(to)) {
      console.warn(`[ios-log-redaction] pattern absent dans ${path}`);
    }
    if (source !== before) {
      writeFileSync(path, source, "utf8");
      patchedFiles += 1;
      console.log(`[ios-log-redaction] patched ${path}`);
    }
  }
}

if (patchedFiles === 0) {
  console.log("[ios-log-redaction] déjà à jour ou fichiers Capacitor absents");
} else {
  console.log(`[ios-log-redaction] ${patchedFiles} fichier(s) mis à jour`);
}
