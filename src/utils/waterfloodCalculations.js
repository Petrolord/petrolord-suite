// Re-export shim — this engine lives in the central @petrolord/engines repo, vendored at packages/engines (git subtree). Never edit the vendored copy from the Suite; changes go to Petrolord/petrolord-engines and are subtree-pulled.
export * from '../../packages/engines/engines/waterflood/waterflood.js';

// CSV import helper stays Suite-side: papaparse is a runtime dependency
// the pure engines package must not carry.
import Papa from 'papaparse';

// Robust CSV parse via papaparse (handles quoted fields, blank cells, trailing
// commas) — the old naive split(',') broke on all three.
export function parseWaterfloodCSV(csvText) {
  const parsed = Papa.parse((csvText || '').trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  return Array.isArray(parsed.data) ? parsed.data : [];
}
