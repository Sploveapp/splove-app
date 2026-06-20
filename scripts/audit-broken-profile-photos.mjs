/**
 * Audit : profils dont les URLs photo pointent vers des objets Storage vides / octet-stream.
 * Usage : node scripts/audit-broken-profile-photos.mjs
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const raw = readFileSync(".env", "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

function trim(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function headPhotoUrl(url) {
  try {
    const res = await fetch(url.split("?")[0], { method: "HEAD" });
    const contentType = res.headers.get("content-type");
    const contentLength = Number.parseInt(res.headers.get("content-length") ?? "", 10);
    const len = Number.isFinite(contentLength) ? contentLength : null;
    const broken =
      !res.ok ||
      !len ||
      len <= 0 ||
      (contentType ?? "").toLowerCase().includes("application/octet-stream");
    return { status: res.status, contentType, contentLength: len, broken };
  } catch (e) {
    return { status: null, contentType: null, contentLength: null, broken: true, error: String(e) };
  }
}

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function listAllObjects(prefix = "") {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from("profile-photos").list(prefix, {
      limit: 100,
      offset,
    });
    if (error) throw error;
    if (!data?.length) break;
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        all.push(...(await listAllObjects(fullPath)));
      } else {
        all.push({ ...item, fullPath });
      }
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return all;
}

console.log("Scan bucket profile-photos…");
const objects = await listAllObjects("");
const brokenObjects = objects.filter((o) => (o.metadata?.size ?? 0) <= 0);
const userIds = [...new Set(brokenObjects.map((o) => o.fullPath.split("/")[0]).filter(Boolean))];

console.log("\n=== Objets Storage cassés (0 octet) ===");
console.log(`Objets: ${brokenObjects.length} | Utilisateurs concernés: ${userIds.length}`);
for (const obj of brokenObjects.slice(0, 30)) {
  console.log(
    `  ${obj.fullPath}  mime=${obj.metadata?.mimetype ?? "?"}  size=${obj.metadata?.size ?? 0}`,
  );
}
if (brokenObjects.length > 30) {
  console.log(`  … et ${brokenObjects.length - 30} autres objets`);
}

console.log("\n=== IDs utilisateurs (dossiers Storage) ===");
for (const uid of userIds) {
  console.log(`  ${uid}`);
}

const PAGE = 200;
let offset = 0;
const affected = [];

while (true) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, main_photo_url, portrait_url, fullbody_url, avatar_url")
    .range(offset, offset + PAGE - 1);
  if (error) {
    console.error("profiles select failed:", error.message);
    process.exit(1);
  }
  if (!data?.length) break;

  for (const row of data) {
    const fields = ["main_photo_url", "portrait_url", "fullbody_url", "avatar_url"];
    const brokenFields = [];
    const seen = new Set();
    for (const field of fields) {
      const url = trim(row[field]);
      if (!url || !url.includes("/profile-photos/") || seen.has(url)) continue;
      seen.add(url);
      const head = await headPhotoUrl(url);
      if (head.broken) {
        brokenFields.push({ field, url, ...head });
      }
    }
    if (brokenFields.length) {
      affected.push({ userId: row.id, brokenFields });
    }
  }

  if (data.length < PAGE) break;
  offset += PAGE;
}

console.log("\n=== Profils BDD avec URLs photo Storage cassées (HEAD) ===");
console.log(`Total: ${affected.length} (nécessite lecture profiles — 0 si RLS anon)`);
for (const item of affected.slice(0, 50)) {
  console.log(`\n${item.userId}`);
  for (const bf of item.brokenFields) {
    console.log(
      `  ${bf.field}: status=${bf.status} len=${bf.contentLength} ct=${bf.contentType ?? "null"}`,
    );
  }
}
if (affected.length > 50) {
  console.log(`\n… et ${affected.length - 50} autres profils`);
}
