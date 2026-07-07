#!/usr/bin/env node
/**
 * Capacitor 8 iOS : les plugins locaux doivent figurer dans packageClassList
 * (ios/App/App/capacitor.config.json). cap sync peut écraser cette liste.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_CLASS = "SploveIosGoogleOAuthPlugin";
const configPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "ios/App/App/capacitor.config.json",
);

if (!existsSync(configPath)) {
  console.warn("[ios-oauth-plugin] capacitor.config.json introuvable — skip");
  process.exit(0);
}

const raw = readFileSync(configPath, "utf8");
const config = JSON.parse(raw);
const list = Array.isArray(config.packageClassList) ? [...config.packageClassList] : [];

if (!list.includes(PLUGIN_CLASS)) {
  list.push(PLUGIN_CLASS);
  config.packageClassList = list;
  writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
  console.log(`[ios-oauth-plugin] ajouté ${PLUGIN_CLASS} à packageClassList`);
} else {
  console.log(`[ios-oauth-plugin] ${PLUGIN_CLASS} déjà enregistré`);
}
