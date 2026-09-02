// Dangling-reference detector (Project Portability PP1 gate, PLAN §6/§7).
//
// The biggest correctness risk in a package is an id hidden inside jsonb
// (a layout's curve address, a provenance block, a session payload) that
// points at a row the package does not carry. This scans every dumped row
// for uuid-shaped strings, wherever they sit, and classifies each one:
//   - internal:  the id of a row in the package (any table)
//   - scope:     a user / organization id (remapped to the importer in PP2)
//   - allowed:   matched an explicit allowlist the caller passed (e.g. ids of
//                registries deliberately outside this package kind)
//   - external:  sits at a path the spec declares optional (a reference the
//                importer may null when unmapped, e.g. a log's parent
//                interpretation that was not packaged)
//   - dangling:  none of the above
// The PP1 gate requires zero dangling references on the type-well package.

const UUID_ANY = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export const SCOPE_COLUMNS = new Set(['user_id', 'organization_id', 'owner_id', 'created_by', 'updated_by', 'shared_by', 'imported_by']);

/** Walk any JSON value, calling visit(uuid, path) for every uuid-shaped string. */
export function walkUuids(value, visit, path = '') {
  if (value == null) return;
  if (typeof value === 'string') {
    const m = value.match(UUID_ANY);
    if (m) for (const id of m) visit(id.toLowerCase(), path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkUuids(v, visit, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkUuids(v, visit, path ? `${path}.${k}` : k);
  }
}

/**
 * @param {Record<string, Array<object>>} tables  table -> rows as dumped
 * @param {{ pkColumn?: (table: string) => string, allow?: Iterable<string>, scopeIds?: Iterable<string>,
 *           external?: (table: string, path: string) => boolean }} opts
 * @returns {{ internal: number, scope: number, allowed: number, external: number,
 *             dangling: Array<{table, rowId, path, id}>, ids: Set<string> }}
 */
export function detectDanglingRefs(tables, { pkColumn = () => 'id', allow = [], scopeIds = [], external = () => false } = {}) {
  const ids = new Set();
  for (const [table, rows] of Object.entries(tables)) {
    const pk = pkColumn(table);
    for (const row of rows) if (row && typeof row[pk] === 'string') ids.add(row[pk].toLowerCase());
  }
  const allowed = new Set(Array.from(allow, (s) => String(s).toLowerCase()));
  const scope = new Set(Array.from(scopeIds, (s) => String(s).toLowerCase()));

  const result = { internal: 0, scope: 0, allowed: 0, external: 0, dangling: [], ids };
  for (const [table, rows] of Object.entries(tables)) {
    const pk = pkColumn(table);
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const rowId = typeof row[pk] === 'string' ? row[pk] : null;
      for (const [col, val] of Object.entries(row)) {
        walkUuids(val, (id, path) => {
          const topCol = col;
          if (ids.has(id)) { result.internal += 1; return; }
          if (SCOPE_COLUMNS.has(topCol) || scope.has(id)) { result.scope += 1; return; }
          if (allowed.has(id)) { result.allowed += 1; return; }
          if (external(table, path || col)) { result.external += 1; return; }
          result.dangling.push({ table, rowId, path: path || col, id });
        }, col);
      }
    }
  }
  return result;
}
