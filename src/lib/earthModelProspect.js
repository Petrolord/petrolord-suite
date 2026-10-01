// Earth model to ReservoirCalc Pro as a prospect (Earth Modeling upgrade
// U2-009, 2026-10-01). The handoff contract between the two apps; neither
// app reaches into the other's state.
//
// Earth Modeling writes one payload per click (buildEarthModelProspect,
// writeProspectHandoff) and opens ReservoirCalc Pro with
// ?emProspect=<id>&zone=<i>. ReservoirCalc Pro reads it (readProspectHandoff)
// and turns one zone into its simple-method inputs
// (prospectZoneToRcpInputs) in ITS current unit system. The payload is in
// SI (m, m2, m3, rm3/sm3) whatever either app displays.
//
// The simple method computes GRV = area x thickness and HCPV = GRV x NTG x
// phi x (1 - Sw). The handoff chooses those inputs so the model's numbers
// come back exactly:
//   area      the zone's mapped area (live cells x cell area)
//   thickness GRV of the hydrocarbon legs / area (an average column)
//   NTG       NRV / GRV of the zone, phi = PV / NRV
//   Sw        1 - HCPV / (PV x hydrocarbon fraction of the GRV), the
//             saturation that conserves the model's HCPV (said in the notes)
//   gas-cap fraction = gas GRV / hydrocarbon GRV (oil and gas zones)
// For a single-fluid zone ReservoirCalc Pro's STOIIP or GIIP then equals the
// model's (the gate runs RCP's own VolumeCalculationEngine). With a gas cap
// and properties that differ between the legs the split is approximate,
// and the notes say so.
//
// Payload schema 'em-prospect/1':
//   {schema, id, createdAt, model: {name, crs, xyUnit, frame: {nx, ny, dxM, dyM}},
//    wells: [names used], report: {field, analyst},
//    zones: [{name, registryZone, cells, areaM2, volumes: {bulk_m3, net_m3, pore_m3,
//      hcpv_m3, gas_bulk_m3, oil_bulk_m3, gas_hcpv_m3, oil_hcpv_m3, stoiip_m3, giip_m3},
//      fluids: {goc_m, owc_m, bo, bg_rm3_sm3, blocks}, flags: [text]}]}

export const EM_PROSPECT_SCHEMA = 'em-prospect/1';
const KEY = 'em.prospect.';
const KEEP = 5;
const M2_PER_ACRE = 4046.8564224;
const M_PER_FT = 0.3048;

const num = (v) => (Number.isFinite(v) ? v : null);

/** The payload from a built model. */
export function buildEarthModelProspect(built, { name = 'Earth model', wells = [], report = {}, now = new Date() } = {}) {
  if (!built?.zones?.length) throw new Error('Build the model first; there is no prospect to send.');
  const fm = built.specM || built.spec;
  const cellM2 = Math.abs(fm.dx * fm.dy);
  const zones = built.zones.map((z) => {
    const t = z.volumes?.total || {};
    const f = z.fluids || {};
    const flags = [];
    if (z.openEdge?.open) flags.push(z.openEdge.spillAtEdge ? 'The trap spills at the model edge; the volume is a minimum.' : 'The hydrocarbon leg reaches the model edge; the volume depends on where the frame stops.');
    if (!Number.isFinite(f.owc) && !z.shm?.fwlAsContact && !Object.values(f.blocks || {}).some((b) => Number.isFinite(b?.owc))) flags.push('No OWC: the whole zone counts as hydrocarbon.');
    if (Object.keys(f.blocks || {}).length) flags.push('Contacts differ by fault block in the model; ReservoirCalc Pro receives the zone totals.');
    if (z.trap) flags.push('The leg is bounded by the closure and spill in the model.');
    if (z.shm) flags.push(`Sw from saturation-height (${z.shm.project}) in the model.`);
    return {
      name: z.name,
      registryZone: z.registryZone || '',
      cells: t.cells || 0,
      areaM2: (t.cells || 0) * cellM2,
      volumes: Object.fromEntries(['bulk_m3', 'net_m3', 'pore_m3', 'hcpv_m3', 'gas_bulk_m3', 'oil_bulk_m3', 'gas_hcpv_m3', 'oil_hcpv_m3', 'stoiip_m3', 'giip_m3'].map((k) => [k, num(t[k])])),
      fluids: { goc_m: num(f.goc), owc_m: num(f.owc) ?? (z.shm?.fwlAsContact ? z.shm.fwlM : null), bo: num(f.bo), bg_rm3_sm3: num(f.bg), blocks: f.blocks || null },
      flags,
    };
  });
  const id = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    schema: EM_PROSPECT_SCHEMA,
    id,
    createdAt: now.toISOString(),
    model: { name, crs: built.crs || null, xyUnit: built.xyUnit || 'm', frame: { nx: built.spec.nx, ny: built.spec.ny, dxM: fm.dx, dyM: fm.dy } },
    wells: [...new Set((wells || []).map((w) => w.name).filter(Boolean))],
    report: { field: String(report.field || ''), analyst: String(report.analyst || '') },
    zones,
  };
}

/**
 * One zone as ReservoirCalc Pro simple-method inputs in its unit system
 * (field: acres, ft; metric: km2, m; FVFs in rb/stb and rcf/scf = rm3/sm3).
 * @returns {{inputs: object, notes: string[]}}
 */
export function prospectZoneToRcpInputs(payload, zoneIndex = 0, unitSystem = 'field') {
  if (!payload || payload.schema !== EM_PROSPECT_SCHEMA) throw new Error('This is not an Earth Modeling prospect (schema em-prospect/1).');
  const z = payload.zones?.[zoneIndex];
  if (!z) throw new Error(`The prospect has no zone ${zoneIndex + 1}.`);
  const v = z.volumes;
  const hcBulk = (v.gas_bulk_m3 ?? 0) + (v.oil_bulk_m3 ?? 0);
  const hasSplit = v.gas_bulk_m3 !== null || v.oil_bulk_m3 !== null;
  const grvHc = hasSplit ? hcBulk : v.bulk_m3;
  if (!(z.areaM2 > 0) || !(grvHc > 0)) throw new Error(`${z.name} holds no hydrocarbon in the model, so there is nothing to send.`);
  if (!(v.net_m3 > 0) || !(v.pore_m3 > 0) || v.hcpv_m3 === null) throw new Error(`${z.name} has no porosity, NTG or Sw in the model.`);
  const ntg = v.net_m3 / v.bulk_m3;
  const phi = v.pore_m3 / v.net_m3;
  const hcFrac = grvHc / v.bulk_m3;
  const sw = 1 - v.hcpv_m3 / (v.pore_m3 * hcFrac);
  const gas = hasSplit ? (v.gas_bulk_m3 || 0) : 0;
  const oil = hasSplit ? (v.oil_bulk_m3 || 0) : grvHc;
  const fluidType = gas > 0 && oil > 0 ? 'oil_gas' : gas > 0 ? 'gas' : 'oil';
  const metric = unitSystem === 'metric';
  const thicknessM = grvHc / z.areaM2;
  const inputs = {
    area: metric ? z.areaM2 / 1e6 : z.areaM2 / M2_PER_ACRE,
    thickness: metric ? thicknessM : thicknessM / M_PER_FT,
    ntg, porosity: phi, sw,
    fluidType,
    ...(Number.isFinite(z.fluids.bo) ? { fvf: z.fluids.bo } : {}),
    ...(Number.isFinite(z.fluids.bg_rm3_sm3) ? { bg: z.fluids.bg_rm3_sm3 } : {}),
    ...(fluidType === 'oil_gas' ? { gasCapFraction: gas / grvHc } : {}),
    // contacts as TVDSS elevation, negative below datum, in the system's length unit
    ...(Number.isFinite(z.fluids.owc_m) ? { owc: -(metric ? z.fluids.owc_m : z.fluids.owc_m / M_PER_FT) } : {}),
    ...(Number.isFinite(z.fluids.goc_m) ? { goc: -(metric ? z.fluids.goc_m : z.fluids.goc_m / M_PER_FT) } : {}),
  };
  const notes = [
    `From Earth Modeling: ${payload.model.name}, ${z.name}${payload.report?.field ? `, field ${payload.report.field}` : ''} (${payload.createdAt.slice(0, 10)}).`,
    `Area is the zone's mapped area; thickness is the average hydrocarbon column (GRV of the legs / area), so GRV matches the model.`,
    `Sw ${sw.toFixed(4)} is the saturation that keeps the model's HCPV (pore volume weighted over the hydrocarbon legs).`,
    ...(fluidType === 'oil_gas' ? ['With a gas cap, oil and gas share these averages; the model splits them node by node, so the split here is approximate.'] : []),
    ...(payload.wells?.length ? [`Wells used: ${payload.wells.join(', ')}.`] : []),
    ...z.flags,
  ];
  return { inputs, notes };
}

const store = (s) => {
  if (s) return s;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** Keep the payload for the other app (the last few only). @returns {string} id */
export function writeProspectHandoff(payload, storage = null) {
  const st = store(storage);
  if (!st) throw new Error('This browser blocks local storage, so the prospect cannot be handed over. Use the Volumes CSV instead.');
  const keys = [];
  for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(KEY)) keys.push(k); }
  keys.sort();
  while (keys.length >= KEEP) st.removeItem(keys.shift());
  st.setItem(`${KEY}${payload.id}`, JSON.stringify(payload));
  return payload.id;
}

/** The payload for an id, or null. */
export function readProspectHandoff(id, storage = null) {
  const st = store(storage);
  if (!st || !id) return null;
  try {
    const p = JSON.parse(st.getItem(`${KEY}${id}`) || 'null');
    return p && p.schema === EM_PROSPECT_SCHEMA ? p : null;
  } catch { return null; }
}

/** ReservoirCalc Pro deep link for a handoff. */
export function rcpProspectHref(id, zoneIndex = 0, path = '/dashboard/apps/geoscience/reservoircalc-pro') {
  return `${path}?emProspect=${encodeURIComponent(id)}&zone=${zoneIndex}`;
}
