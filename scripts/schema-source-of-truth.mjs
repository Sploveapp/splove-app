#!/usr/bin/env node
/**
 * Extracts schema from supabase/migrations, scans src/ for Supabase access,
 * writes docs/SCHEMA_SOURCE_OF_TRUTH.md, exits 1 on drift (unknown table/column/RPC).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SRC_DIR = path.join(ROOT, "src");
const DOC_PATH = path.join(ROOT, "docs", "SCHEMA_SOURCE_OF_TRUTH.md");

/** Columns referenced by frontend but absent from migrations (documented exceptions). */
const COLUMN_ALLOWLIST = new Map([
  ["matches", new Set(["conversation_id"])], // legacy; resolved via conversations.match_id
  ["feed_profiles_ranked", new Set(["profile_id"])], // fallback probe legacy shape
  ["feed_profiles", new Set(["profile_id"])],
  ["profiles", new Set(["photo_status"])], // alias applicatif → photo1_status / portrait_photo_status
  ["activity_proposals", new Set(["reminder_6h_sent", "reminder_18h_sent", "expired_notified", "match_id"])], // optionnel / legacy select
  ["sports", new Set(["is_featured"])], // seed / anciennes bases
  ["messages", new Set(["response"])], // clé dans metadata/payload JSON, pas une colonne SQL
]);

/** Tables/views the frontend may query; allowlisted if only in optional paths. */
const TABLE_ALLOWLIST = new Set([
  "referral_codes", // legacy — referral.ts fallback profiles.referral_code
  "referral_events",
  "referrals", // growth — migration dédiée à venir
]);

/** RPCs the frontend calls that may be deployed outside repo migrations. */
const RPC_ALLOWLIST = new Set([
  "touch_profile_activity",
]);

/** Map export const TABLE_FOO = "real_table" from src/. */
function buildTableConstantMap() {
  const map = new Map();
  for (const file of walkTsFiles(SRC_DIR)) {
    const code = fs.readFileSync(file, "utf8");
    for (const m of code.matchAll(
      /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*["']([a-z][a-z0-9_]*)["']/g,
    )) {
      map.set(m[1], m[2]);
    }
  }
  return map;
}

function resolveFromArg(arg, tableConstants) {
  const raw = arg.trim();
  if (/^["']/.test(raw)) return raw.replace(/^["']|["']$/g, "").toLowerCase();
  if (tableConstants.has(raw)) return tableConstants.get(raw);
  return null;
}

const NESTED_RELATION_TABLES = new Set([
  "sports",
  "profile_sports",
  "conversations",
  "messages",
  "meetup_confirmation",
]);

function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function ensureTable(tables, name) {
  const t = name.toLowerCase();
  if (!tables.has(t)) tables.set(t, new Set());
  return tables.get(t);
}

function parseMigrations() {
  const tables = new Map(); // name -> Set<column>
  const views = new Map(); // name -> Set<column> | '*'
  const functions = new Set();
  const deprecated = new Map(); // table -> Set<column>
  const migrationsRequired = [];

  for (const file of migrationFiles()) {
    migrationsRequired.push(file);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    for (const m of sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*;/gi,
    )) {
      const name = m[1].toLowerCase();
      parseColumnDefs(m[2], ensureTable(tables, name));
    }

    for (const m of sql.matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+([\s\S]*?);/gi,
    )) {
      const t = m[1].toLowerCase();
      const body = m[2];
      for (const col of body.matchAll(
        /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi,
      )) {
        ensureTable(tables, t).add(col[1].toLowerCase());
      }
      for (const col of body.matchAll(
        /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi,
      )) {
        const c = col[1].toLowerCase();
        if (!deprecated.has(t)) deprecated.set(t, new Set());
        deprecated.get(t).add(c);
        ensureTable(tables, t).delete(c);
      }
    }

    for (const m of sql.matchAll(
      /COMMENT\s+ON\s+COLUMN\s+(?:public\.)?([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi,
    )) {
      ensureTable(tables, m[1]).add(m[2].toLowerCase());
    }

    for (const m of sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )) {
      const v = m[1].toLowerCase();
      if (!views.has(v)) views.set(v, new Set(["*"]));
    }

    for (const m of sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:IF\s+NOT EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi,
    )) {
      functions.add(m[1].toLowerCase());
    }

    parseInsertColumnsFromMigrations(sql, tables);

    for (const m of sql.matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?messages\b/gi,
    )) {
      if (tables.has("conversation_messages") && !tables.has("messages")) {
        tables.set("messages", new Set(tables.get("conversation_messages")));
      }
    }
  }

  const seedPath = path.join(ROOT, "supabase", "seed", "reset_seed_demo_test_pro.sql");
  if (fs.existsSync(seedPath)) {
    parseInsertColumnsFromMigrations(fs.readFileSync(seedPath, "utf8"), tables);
  }

  applySchemaAliases(tables, views);

  return { tables, views, functions, deprecated, migrationsRequired };
}

function parseColumnDefs(body, colSet) {
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("CONSTRAINT")) continue;
    if (/^(PRIMARY|UNIQUE|CHECK|FOREIGN|REFERENCES|EXCLUDE)\b/i.test(trimmed)) continue;
    const m = trimmed.match(/^([a-z_][a-z0-9_]*)\s+/i);
    if (m) colSet.add(m[1].toLowerCase());
  }
}

function walkTsFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsFiles(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function extractStringLiterals(code) {
  const strings = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/gs;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (m[1] === "`" && m[2].includes("${")) continue;
    strings.push(m[2]);
  }
  return strings;
}

function pushSelectColumnToken(token, cols) {
  const t = token.trim().replace(/,+$/, "");
  if (!t || t.includes("(")) return;
  const col = t.split(/\s+/)[0].toLowerCase().replace(/,+$/, "");
  if (col && col !== "*") cols.push(col);
}

function parseSelectColumns(selectStr) {
  const cols = [];
  let depth = 0;
  let token = "";
  for (const ch of selectStr) {
    if (ch === "(") {
      if (depth === 0) {
        const rel = token.trim().replace(/,+$/, "").split(/\s+/)[0].toLowerCase();
        if (rel && NESTED_RELATION_TABLES.has(rel)) {
          depth = 1;
          token = "";
          continue;
        }
      }
      depth += 1;
      token += ch;
    } else if (ch === ")") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0) {
          token = "";
          continue;
        }
      }
      token += ch;
    } else if (ch === "," && depth === 0) {
      pushSelectColumnToken(token, cols);
      token = "";
    } else {
      token += ch;
    }
  }
  pushSelectColumnToken(token, cols);
  return cols;
}

function parseInsertColumnsFromMigrations(sql, tables) {
  for (const m of sql.matchAll(
    /INSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(\s*([^)]+)\)/gi,
  )) {
    const t = m[1].toLowerCase();
    const colList = m[2].split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
    for (const c of colList) ensureTable(tables, t).add(c);
  }
}

function applySchemaAliases(tables, views) {
  if (tables.has("conversation_messages")) {
    const merged = new Set(tables.get("conversation_messages"));
    if (tables.has("messages")) {
      for (const c of tables.get("messages")) merged.add(c);
    }
    tables.set("messages", merged);
  } else if (!tables.has("messages") && tables.has("conversation_messages")) {
    tables.set("messages", new Set(tables.get("conversation_messages")));
  }
  if (tables.has("likes")) {
    const likes = tables.get("likes");
    likes.add("liker_id");
    likes.add("liked_id");
  }
  if (tables.has("profiles") && views.has("feed_profiles")) {
    views.set("feed_profiles", new Set(tables.get("profiles")));
  }
  if (views.has("feed_profiles")) {
    views.set("feed_profiles_ranked", new Set(views.get("feed_profiles")));
  }
}

function recordColumnAccess(consumers, table, col, file) {
  if (!table || !col) return;
  if (!consumers.tables.has(table)) consumers.tables.set(table, new Map());
  const colMap = consumers.tables.get(table);
  if (!colMap.has(col)) colMap.set(col, new Set());
  colMap.get(col).add(file);
}

function nearestFromTable(tablePositions, index) {
  let table = null;
  for (let i = tablePositions.length - 1; i >= 0; i--) {
    if (tablePositions[i].index < index) {
      table = tablePositions[i].table;
      break;
    }
  }
  return table;
}

function scanFrontend(tableConstants) {
  const consumers = {
    tables: new Map(), // table -> Map<column, Set<file>>
    rpcs: new Map(), // rpc -> Set<file>
  };

  const files = walkTsFiles(SRC_DIR);
  const fromRe = /\.from\s*\(\s*([^)]+?)\s*\)/gi;
  const rpcRe = /\.rpc\s*\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/gi;
  const selectRe = /\.select\s*\(\s*(["'`])([\s\S]*?)\1/gi;

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const code = stripComments(fs.readFileSync(file, "utf8"));

    let m;
    const tablePositions = [];
    while ((m = fromRe.exec(code)) !== null) {
      const table = resolveFromArg(m[1], tableConstants);
      if (table) tablePositions.push({ table, index: m.index });
    }

    while ((m = rpcRe.exec(code)) !== null) {
      const rpc = m[1].toLowerCase();
      if (!consumers.rpcs.has(rpc)) consumers.rpcs.set(rpc, new Set());
      consumers.rpcs.get(rpc).add(rel);
    }

    while ((m = selectRe.exec(code)) !== null) {
      const selectStr = m[2];
      const cols = parseSelectColumns(selectStr);
      const table = nearestFromTable(tablePositions, m.index);
      if (!table) continue;
      for (const col of cols) recordColumnAccess(consumers, table, col, rel);
    }

    const mutRe = /\.from\s*\(\s*([^)]+?)\s*\)\s*\.(insert|update|upsert)\s*\(\s*\{([^}]{0,4000})\}/gi;
    while ((m = mutRe.exec(code)) !== null) {
      const table = resolveFromArg(m[1], tableConstants);
      if (!table) continue;
      const keys = [...m[3].matchAll(/([a-z_][a-z0-9_]*)\s*:/gi)].map((k) => k[1].toLowerCase());
      for (const col of keys) recordColumnAccess(consumers, table, col, rel);
    }
  }

  const selectConstantFiles = [
    ["src/lib/profileSelect.ts", "profiles"],
    ["src/lib/activityProposalsQuery.ts", "activity_proposals"],
  ];
  for (const [relPath, table] of selectConstantFiles) {
    const fp = path.join(ROOT, relPath);
    if (!fs.existsSync(fp)) continue;
    const ps = fs.readFileSync(fp, "utf8");
    for (const m of ps.matchAll(/(?:const|export const)\s+\w+\s*=\s*["']([^"']+)["']/g)) {
      if (!m[1].includes(",")) continue;
      if (!/^[a-z0-9_,\s()]+$/i.test(m[1])) continue;
      for (const col of parseSelectColumns(m[1])) {
        recordColumnAccess(consumers, table, col, relPath);
      }
    }
  }

  return consumers;
}

function columnsForTable(table, schema) {
  if (schema.tables.has(table)) return schema.tables.get(table);
  if (schema.views.has(table)) return schema.views.get(table);
  return null;
}

function checkDrift(schema, consumers) {
  const errors = [];

  for (const [table, colMap] of consumers.tables) {
    if (TABLE_ALLOWLIST.has(table)) continue;
    const official = columnsForTable(table, schema);
    if (!official) {
      errors.push({ kind: "table", table, message: `Table/vue inconnue: ${table}` });
      continue;
    }
    const allowCols = COLUMN_ALLOWLIST.get(table) ?? new Set();
    for (const [col, files] of colMap) {
      if (official.has("*") || official.has(col) || allowCols.has(col)) continue;
      errors.push({
        kind: "column",
        table,
        column: col,
        files: [...files],
        message: `Colonne inexistante: ${table}.${col}`,
      });
    }
  }

  for (const [rpc, files] of consumers.rpcs) {
    if (schema.functions.has(rpc) || RPC_ALLOWLIST.has(rpc)) continue;
    errors.push({
      kind: "rpc",
      rpc,
      files: [...files],
      message: `RPC inexistante: ${rpc}()`,
    });
  }

  return errors;
}

function mdTable(headers, rows) {
  const sep = headers.map(() => "---");
  return [`| ${headers.join(" | ")} |`, `| ${sep.join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join(
    "\n",
  );
}

function generateDoc(schema, consumers, errors) {
  const tableRows = [...schema.tables.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, cols]) => [t, String(cols.size), [...cols].sort().slice(0, 8).join(", ") + (cols.size > 8 ? "…" : "")]);

  const viewRows = [...schema.views.keys()].sort().map((v) => [v, "view", schema.views.get(v).has("*") ? "profiles.*" : [...schema.views.get(v)].join(", ")]);

  const rpcRows = [...schema.functions].sort().map((f) => {
    const used = consumers.rpcs.has(f) ? "oui" : "—";
    const files = consumers.rpcs.has(f) ? [...consumers.rpcs.get(f)].slice(0, 2).join(", ") : "";
    return [f, used, files];
  });

  const deprecatedRows = [];
  for (const [t, cols] of schema.deprecated) {
    for (const c of cols) deprecatedRows.push([t, c, "DROP COLUMN migration"]);
  }
  for (const [t, cols] of COLUMN_ALLOWLIST) {
    for (const c of cols) deprecatedRows.push([t, c, "frontend legacy — ne pas ajouter en SQL"]);
  }
  deprecatedRows.push(["matches", "conversation_id", "absent — utiliser conversations.match_id"]);

  const consumerRows = [];
  for (const [table, colMap] of [...consumers.tables.entries()].sort()) {
    for (const [col, files] of [...colMap.entries()].sort()) {
      consumerRows.push([table, col, [...files].slice(0, 3).join("; ")]);
    }
  }

  const driftSection =
    errors.length === 0
      ? "_Aucun drift détecté lors de la dernière génération._"
      : errors.map((e) => `- **${e.message}** ${e.files ? `(${e.files.join(", ")})` : ""}`).join("\n");

  return `# Schéma Supabase — source de vérité

> Généré par \`npm run schema:check\` — ne pas éditer les sections « Inventaire » à la main.
> Dernière vérification : ${new Date().toISOString().slice(0, 10)}

## Rôle

Référence unique **frontend ↔ Supabase** pour tables, colonnes, RPC et vues définies dans \`supabase/migrations/\`.
Le build échoue si le frontend référence une table/colonne/RPC absente (\`npm run schema:check\`).

## Migrations obligatoires

Appliquer **toutes** les migrations dans l'ordre lexicographic :

${schema.migrationsRequired.map((f) => `- \`${f}\``).join("\n")}

## Tables officielles (${schema.tables.size})

${mdTable(["Table", "Colonnes", "Aperçu"], tableRows)}

<details>
<summary>Colonnes complètes par table</summary>

${[...schema.tables.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([t, cols]) => `### ${t}\n\n\`${[...cols].sort().join("`, `")}\`\n`)
  .join("\n")}

</details>

## Vues officielles (${schema.views.size})

${mdTable(["Vue", "Type", "Colonnes"], viewRows)}

## RPC officielles (${schema.functions.size})

${mdTable(["Fonction", "Frontend", "Fichiers"], rpcRows.slice(0, 40))}

${rpcRows.length > 40 ? `\n_… et ${rpcRows.length - 40} autres fonctions (triggers, internes)._` : ""}

## Colonnes deprecated / legacy

${mdTable(["Table", "Colonne", "Note"], deprecatedRows)}

## Frontend consumers (extrait)

${mdTable(["Table", "Colonne", "Fichiers"], consumerRows.slice(0, 60))}

${consumerRows.length > 60 ? `\n_… et ${consumerRows.length - 60} autres accès._` : ""}

## Allowlists (exceptions documentées)

| Type | Nom | Raison |
|------|-----|--------|
| colonne | matches.conversation_id | Résolu via \`conversations.match_id\` |
| RPC | touch_profile_activity | Optionnel Discover ; peut être hors repo |

## Drift actuel

${driftSection}

## Commandes

\`\`\`bash
npm run schema:check   # régénère ce doc + fail si drift
npm run build          # inclut schema:check avant tsc
\`\`\`
`;
}

function main() {
  const writeDoc = process.argv.includes("--write-doc");
  const tableConstants = buildTableConstantMap();
  const schema = parseMigrations();
  const consumers = scanFrontend(tableConstants);
  const errors = checkDrift(schema, consumers);

  if (writeDoc || !fs.existsSync(DOC_PATH)) {
    fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
    fs.writeFileSync(DOC_PATH, generateDoc(schema, consumers, errors), "utf8");
    console.log(`[schema] wrote ${path.relative(ROOT, DOC_PATH)}`);
  }

  if (errors.length > 0) {
    console.error(`\n[schema] DRIFT DETECTED — ${errors.length} issue(s):\n`);
    for (const e of errors) {
      console.error(`  - ${e.message}`);
      if (e.files?.length) console.error(`    files: ${e.files.join(", ")}`);
    }
    console.error("\nFix: align frontend with migrations or add SQL in supabase/migrations/.\n");
    process.exit(1);
  }

  console.log(
    `[schema] OK — ${schema.tables.size} tables, ${schema.views.size} views, ${schema.functions.size} RPCs; ` +
      `${consumers.tables.size} tables used in frontend`,
  );
}

main();
