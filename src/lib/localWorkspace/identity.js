// Local volume identity (docs/scope/LocalWorkspace-DESIGN.md section 5.3).
//
//   source identity  the full streaming SHA-256 of the SEG-Y (sha256.js),
//                    recorded as manifest.source.sha256
//   content_id       a hash of what the bricks are a function of: the source
//                    hash, header mapping, crop, codec and, for a derived
//                    volume, the parent's content_id, the job recipe and the
//                    engine commit. The engines are deterministic, so two
//                    machines with the same source and recipe make the same
//                    bricks, and the same content_id.
//   brick_root       a hash over every stored brick's own SHA-256, sorted by
//                    brick key. Two stores with equal roots hold identical
//                    bytes, brick for brick; a replica is ready only when its
//                    bricks hash back to its root.
//
// Pure functions; the same code computes a root over a server volume's
// bricks in the parity check (tools/local-workspace).

import { canonicalJson, sha256Hex } from './sha256';

export const CONTENT_ID_VERSION = 'lv1';

/**
 * @param {Object} recipe
 * @param {?{sha256: string, size?: number}} [recipe.source] the SEG-Y (imports)
 * @param {Object} [recipe.mapping] header byte mapping
 * @param {?Object} [recipe.crop] crop provenance
 * @param {Object} [recipe.codec] {f32, display, dtype}
 * @param {?string} [recipe.parent] parent content_id (derived volumes)
 * @param {?Object} [recipe.job] {kind, params} of the job that made it
 * @param {?string} [recipe.engine] engine commit (derived volumes)
 * @returns {Promise<string>} "lv1-<hex>"
 */
export async function contentIdOf(recipe) {
  const body = canonicalJson({
    v: CONTENT_ID_VERSION,
    source: recipe.source ? { sha256: recipe.source.sha256, size: recipe.source.size ?? null } : null,
    mapping: recipe.mapping ?? null,
    crop: recipe.crop ?? null,
    codec: recipe.codec ?? null,
    parent: recipe.parent ?? null,
    job: recipe.job ?? null,
    engine: recipe.engine ?? null,
  });
  return `${CONTENT_ID_VERSION}-${await sha256Hex(new TextEncoder().encode(body))}`;
}

/** The lines a brick root hashes: "key sha\n", sorted by key. */
export function brickRootText(entries) {
  const rows = [...entries].map(([key, sha]) => [String(key), String(sha)]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return rows.map(([k, s]) => `${k} ${s}\n`).join('');
}

/**
 * @param {Iterable<[string, string]>} entries [brick key relative to the
 *   volume directory, hex SHA-256 of the stored bytes]
 * @returns {Promise<string>} "br1-<hex>"
 */
export async function brickRootOf(entries) {
  return `br1-${await sha256Hex(new TextEncoder().encode(brickRootText(entries)))}`;
}

/** Engine commit string for jobs run in this browser, the server's format with a prefix. */
export function browserEngineCommit(suiteSha, enginesCommit) {
  return `browser-suite-${String(suiteSha || 'unknown').slice(0, 9)}+engines-${String(enginesCommit || 'unknown').slice(0, 9)}`;
}
