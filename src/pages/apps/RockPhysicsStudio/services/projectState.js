// rp_projects row <-> workstation state (RP-U1-001, RP-U1-013, 2026-10-01).
//
// The table (migration 20260714100000) has the columns below. Until this
// upgrade the workstation wrote `{scenario, rock, avo, wedge}`: `scenario`
// is not a column, so PostgREST refused every save on the registry backend
// and the live table held 0 rows. The scenario now goes into `scenarios`
// (a one-element array, the column's "scenario table" shape), the well
// into `well_ids` (so a .pld package carries it) and the zone into the
// rock jsonb (the column comment: "curve picks, interval").
//
// The reader is tolerant: a row saved by the harness before this change
// (`scenario`), a fluid side whose hydrocarbon is a bare string, and rows
// with missing jsonb all open. Pure, no I/O.

/** The rp_projects columns a save may write (the migration's list). */
export const RP_PROJECT_COLUMNS = Object.freeze([
  'id', 'user_id', 'name', 'well_ids', 'scenarios', 'rock', 'avo', 'wedge', 'created_at', 'updated_at',
  'schema_version', 'app_build', 'engine_version',
]);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** A fluid side in the current shape ({sw, hc: {kind, ...}}). */
export function normalizeSide(side) {
  if (!isObj(side)) return null;
  const hc = typeof side.hc === 'string' ? { kind: side.hc } : (isObj(side.hc) ? side.hc : { kind: 'gas' });
  const kind = ['gas', 'oil-dead', 'oil-live'].includes(hc.kind) ? hc.kind : 'gas';
  const out = { ...side, hc: { ...hc, kind } };
  if (kind === 'gas' && !Number.isFinite(Number(out.hc.gravity))) out.hc.gravity = 0.6;
  if (kind !== 'gas' && !Number.isFinite(Number(out.hc.api))) out.hc.api = 35;
  return out;
}

/**
 * The row a save writes.
 * @param {{scenario: Object, rock: Object, avo: Object, wedge: Object, wellId?: ?string, zoneId?: ?string}} s
 */
export function projectRowFromState({ scenario, rock, avo, wedge, wellId = null, zoneId = null }) {
  return {
    scenarios: scenario ? [scenario] : [],
    rock: { ...(rock || {}), zoneId: zoneId || null },
    avo: avo || {},
    wedge: wedge || {},
    // every well with a published gather stays findable (loadGatherForWell
    // looks the project up by well), as well as the well on screen
    well_ids: [...new Set([wellId, ...Object.keys((avo && avo.published_gathers) || {})].filter(Boolean))],
  };
}

/**
 * Workstation state from a saved row (any release).
 * @returns {{scenario: ?Object, rock: ?Object, avo: ?Object, wedge: ?Object, wellId: ?string, zoneId: ?string}}
 */
export function projectStateFromRow(row) {
  if (!isObj(row)) return { scenario: null, rock: null, avo: null, wedge: null, wellId: null, zoneId: null };
  const raw = Array.isArray(row.scenarios) && row.scenarios.length ? row.scenarios[0]
    : (isObj(row.scenarios) ? row.scenarios : (isObj(row.scenario) ? row.scenario : null));
  let scenario = null;
  if (isObj(raw)) {
    scenario = { ...raw };
    if (raw.fluidA) scenario.fluidA = normalizeSide(raw.fluidA);
    if (raw.fluidB) scenario.fluidB = normalizeSide(raw.fluidB);
  }
  const rock = isObj(row.rock) && Object.keys(row.rock).length ? { ...row.rock } : null;
  const zoneId = rock?.zoneId || null;
  if (rock) delete rock.zoneId;
  return {
    scenario,
    rock,
    avo: isObj(row.avo) && Object.keys(row.avo).length ? row.avo : null,
    wedge: isObj(row.wedge) && Object.keys(row.wedge).length ? row.wedge : null,
    wellId: Array.isArray(row.well_ids) && row.well_ids.length ? row.well_ids[0] : null,
    zoneId,
  };
}
