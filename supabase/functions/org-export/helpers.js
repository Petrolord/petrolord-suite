// Pure helpers for the org-export edge function. No imports and no Deno APIs
// on purpose: index.ts (Deno) imports this file directly, and the jest suite
// in __tests__/ exercises it under node, honoring the one-test-runner rule.

// Tables whose rows point at Storage objects. `prefix` means storage_path is a
// folder holding many objects (seismic brick pyramids); `object` means it is a
// single file. Keep in lockstep with the app-side registries
// (ingestService.js, wellsRegistry.js, surfacesRegistry.js).
export const POINTER_TABLES = {
  seismic_volumes:           { bucket: 'seismic',  column: 'storage_path', kind: 'prefix' },
  seismic_horizons:          { bucket: 'seismic',  column: 'storage_path', kind: 'object' },
  seismic_exported_surfaces: { bucket: 'seismic',  column: 'storage_path', kind: 'object' },
  geo_wells_logs:            { bucket: 'wells',    column: 'storage_path', kind: 'object' },
  geo_surfaces:              { bucket: 'surfaces', column: 'storage_path', kind: 'object' },
};

export const EXPORT_BUCKETS = ['seismic', 'wells', 'surfaces'];

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Create the in-memory row store: table -> { rows: [], ids: Set|null }.
 * `ids` tracks primary-key values for dedupe and for the descendant sweep;
 * tables without a single-column uuid PK fall back to append-only (null ids).
 */
export function createRowStore() {
  return new Map();
}

/**
 * Merge dumped rows into the store, deduplicating by pk when the table has
 * one. Returns the number of genuinely new rows.
 */
export function mergeRows(store, table, rows, pkColumn) {
  let entry = store.get(table);
  if (!entry) {
    entry = { rows: [], ids: pkColumn ? new Set() : null };
    store.set(table, entry);
  }
  let added = 0;
  for (const row of rows) {
    if (entry.ids && pkColumn) {
      const id = row[pkColumn];
      if (id != null && entry.ids.has(id)) continue;
      if (id != null) entry.ids.add(id);
    }
    entry.rows.push(row);
    added += 1;
  }
  return added;
}

/** Ids present in the store for a table (empty array when untracked). */
export function storedIds(store, table) {
  const entry = store.get(table);
  return entry && entry.ids ? Array.from(entry.ids) : [];
}

/** { table: rowCount } for every table with at least one row. */
export function tableCounts(store) {
  const out = {};
  for (const [table, entry] of store) {
    if (entry.rows.length > 0) out[table] = entry.rows.length;
  }
  return out;
}

/**
 * Compare the row tallies of the seed passes against independent recounts.
 * Returns [{ table, column, dumped, counted }] mismatches only.
 */
export function verifyCounts(seedTallies, recounts) {
  const mismatches = [];
  for (const t of seedTallies) {
    const key = `${t.table}:${t.column}`;
    const counted = recounts[key];
    if (counted != null && counted !== t.rows) {
      mismatches.push({ table: t.table, column: t.column, dumped: t.rows, counted });
    }
  }
  return mismatches;
}

/**
 * Walk the dumped rows of the pointer tables and produce the storage work
 * list: single objects and prefixes to enumerate, deduplicated, with the
 * source row recorded for attribution in the manifest.
 */
export function collectStorageTargets(store) {
  const objects = [];
  const prefixes = [];
  const seen = new Set();
  for (const [table, cfg] of Object.entries(POINTER_TABLES)) {
    const entry = store.get(table);
    if (!entry) continue;
    for (const row of entry.rows) {
      const path = row[cfg.column];
      if (!path || typeof path !== 'string') continue;
      const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '');
      const key = `${cfg.bucket}:${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const target = {
        bucket: cfg.bucket,
        path: normalized,
        source_table: table,
        source_id: row.id ?? null,
        owner_user_id: normalized.split('/')[0] || null,
      };
      (cfg.kind === 'prefix' ? prefixes : objects).push(target);
    }
  }
  return { objects, prefixes };
}

/** Sum of known sizes across manifest storage entries (nulls skipped). */
export function totalBlobBytes(entries) {
  let total = 0;
  for (const e of entries) if (typeof e.size === 'number') total += e.size;
  return total;
}

/** Keep object keys filesystem/URL-safe inside the zip. */
export function safeSegment(name) {
  return String(name).replace(/[^A-Za-z0-9._-]+/g, '_');
}

/**
 * Human-readable README for the zip. Plain sentences, no em dashes
 * (owner copy rule).
 */
export function buildReadme({ orgName, jobId, generatedAt, tableCount, rowTotal, blobCount, notes }) {
  const lines = [
    `Petrolord organization data export`,
    ``,
    `Organization: ${orgName}`,
    `Export job:   ${jobId}`,
    `Generated:    ${generatedAt}`,
    ``,
    `Contents`,
    `  manifest.json      Machine-readable inventory of this export.`,
    `  data/<table>.json  One JSON array per database table (${tableCount} tables, ${rowTotal} rows).`,
    ``,
    `Files stored in Petrolord cloud storage (${blobCount} objects, for example seismic`,
    `volumes and well log curves) are not inside this zip. They are listed in`,
    `manifest.json under "storage" and can be downloaded from the Data Export page`,
    `in your dashboard, which issues a fresh secure link for each file.`,
    ``,
    `Columns whose names contain token, secret, password or api_key are removed`,
    `from every table before export.`,
  ];
  if (notes && notes.length) {
    lines.push(``, `Notes`);
    for (const n of notes) lines.push(`  - ${n}`);
  }
  lines.push(``);
  return lines.join('\n');
}
