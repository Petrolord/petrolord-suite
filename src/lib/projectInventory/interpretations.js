// Project Data Inventory: the interpretation records in the project, from
// the registries the Suite already keeps: Seismolord horizons and faults
// (seismic_horizons, seismic_faults), mapped surfaces (geo_surfaces), the
// velocity information (checkshots, a stacking velocity a QI study holds),
// well ties and their wavelets (geo_wells.checkshots_derived), zones, the
// curves Petrophysics Studio published, and the host app's own records.
// Each row has a state, a count and the evidence in words. Pure.

import { tieRecord, checkshotPairs } from './cells';
import { familyOfLog } from './columns';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const stripCopy = (name) => String(name || '').replace(/\s*\((\d+|pre-fault)\)\s*$/i, '').trim();

/**
 * @param {{wells: Array<{well, logs, zones}>, horizons?: Object[], faults?: Object[], surfaces?: Object[], extras?: {velocity?: Array<{name, source}>, records?: Array<{key, label, status, count, text}>}}} p
 */
export function interpretationRows({ wells = [], horizons = [], faults = [], surfaces = [], extras = {} }) {
  const rows = [];
  const nW = wells.length;
  const liveH = (horizons || []).filter((h) => !h.archived_at);
  const names = [...new Set(liveH.map((h) => stripCopy(h.name)))];
  const domains = [...new Set(liveH.map((h) => (String(h.domain || '').startsWith('depth') ? 'depth' : 'time')))];
  rows.push({
    key: 'horizons', label: 'Seismic horizons', status: liveH.length ? 'complete' : 'missing', count: liveH.length,
    text: liveH.length
      ? `${plural(liveH.length, 'horizon')} (${plural(names.length, 'surface name')}) in ${domains.join(' and ')}: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ', ...' : ''}.`
      : 'No horizons interpreted in Seismolord.',
  });
  const liveF = (faults || []).filter((f) => !f.archived_at);
  rows.push({
    key: 'faults', label: 'Faults', status: liveF.length ? 'complete' : 'missing', count: liveF.length,
    text: liveF.length ? `${plural(liveF.length, 'fault')} interpreted in Seismolord.` : 'No faults interpreted.',
  });
  const structure = (surfaces || []).filter((s) => s.kind !== 'attribute' && s.z_domain !== 'attribute');
  const depthMaps = structure.filter((s) => s.z_domain === 'depth');
  const timeMaps = structure.filter((s) => s.z_domain === 'time');
  const attrMaps = (surfaces || []).filter((s) => s.kind === 'attribute' || s.z_domain === 'attribute');
  rows.push({
    key: 'surfaces', label: 'Mapped surfaces', status: depthMaps.length ? 'complete' : structure.length ? 'partial' : 'missing', count: (surfaces || []).length,
    text: (surfaces || []).length
      ? `${plural(depthMaps.length, 'depth map')}, ${plural(timeMaps.length, 'time map')}, ${plural(attrMaps.length, 'attribute map')} in the surfaces registry.`
      : 'No maps in the surfaces registry.',
    depthMaps: depthMaps.length,
  });
  const cs = wells.filter((w) => checkshotPairs(w.well).length >= 2).length;
  const vel = extras.velocity || [];
  rows.push({
    key: 'velocity', label: 'Velocity model', status: vel.length ? 'complete' : cs ? 'partial' : 'missing', count: vel.length,
    text: vel.length
      ? `${vel.map((v) => v.name).join(', ')}${cs ? `; checkshots on ${cs} of ${nW} wells as control` : ''}.`
      : cs ? `No velocity model loaded; checkshots on ${cs} of ${nW} wells give well control only.` : 'No velocity model and no checkshots.',
    checkshotWells: cs,
  });
  const ties = wells.map((w) => tieRecord(w.well)).filter(Boolean);
  const wav = ties.filter((t) => t.wavelet?.stored).length;
  const corr = ties.map((t) => t.meanCorr).filter((c) => c !== null);
  rows.push({
    key: 'ties', label: 'Well ties and wavelets', status: !ties.length ? 'missing' : ties.length === nW ? 'complete' : 'partial', count: ties.length,
    text: ties.length
      ? `${ties.length} of ${nW} wells tied${corr.length ? `, correlation ${Math.min(...corr).toFixed(2)} to ${Math.max(...corr).toFixed(2)}` : ''}; ${plural(wav, 'wavelet')} stored.`
      : 'No well ties committed, so no extracted wavelets.',
    wavelets: wav,
  });
  const zoneWells = wells.filter((w) => (w.zones || []).length).length;
  const zoneNames = [...new Set(wells.flatMap((w) => (w.zones || []).map((z) => z.name)))];
  rows.push({
    key: 'zones', label: 'Zones', status: !zoneWells ? 'missing' : zoneWells === nW ? 'complete' : 'partial', count: zoneNames.length,
    text: zoneWells ? `${plural(zoneNames.length, 'zone name')} on ${zoneWells} of ${nW} wells.` : 'No zones defined on the wells.',
  });
  const petroWells = wells.filter((w) => (w.logs || []).some((l) => l.provenance?.engine === 'petrophysics-studio' || (l.provenance?.computed && ['vsh', 'phi', 'sw'].includes(familyOfLog(l)?.key))));
  const petroCurves = [...new Set(petroWells.flatMap((w) => (w.logs || []).filter((l) => l.provenance?.engine === 'petrophysics-studio').map((l) => String(l.mnemonic).split(':')[0])))];
  rows.push({
    key: 'petro', label: 'Published petrophysics', status: !petroWells.length ? 'missing' : petroWells.length === nW ? 'complete' : 'partial', count: petroWells.length,
    text: petroWells.length
      ? `${petroWells.length} of ${nW} wells carry Petrophysics Studio curves${petroCurves.length ? ` (${petroCurves.join(', ')})` : ''}.`
      : 'No interpreted curves published from Petrophysics Studio.',
  });
  for (const r of extras.records || []) rows.push({ ...r });
  return rows;
}
