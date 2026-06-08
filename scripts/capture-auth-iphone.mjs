/**
 * Capture #/auth en viewport iPhone (preview Vite).
 * Usage: node scripts/capture-auth-iphone.mjs [baseUrl]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(root, "../docs/previews");
const outFile = path.join(outDir, "auth-iphone.png");
const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";

const device = devices["iPhone 15 Pro"];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...device,
  locale: "fr-FR",
});
const page = await context.newPage();

await page.goto(`${baseUrl}/#/auth`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForSelector('img[alt="SPLove"]', { timeout: 30_000 });
await page.waitForTimeout(600);

await mkdir(outDir, { recursive: true });
await page.screenshot({ path: outFile, fullPage: false });
await writeFile(
  path.join(outDir, "auth-iphone.meta.json"),
  JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl, device: "iPhone 15 Pro" }, null, 2)
);

await browser.close();
console.log(`[capture-auth] wrote ${outFile}`);
