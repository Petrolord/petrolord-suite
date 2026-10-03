// Export tab glue (SC5; SCAL-U1): pure CSV builders and the Waterflood
// handoff payload. Jest-guarded; the tab component only downloads and
// navigates.
//
// SCAL-U1-008: every CSV can open with '# ' lines that say where it came
// from (the kr-1 block: project, time, build, how each set was made, the
// samples, the scope) and its units; the Pc and height files print in the
// display units of the project, named in the column heads. Without options
// the files are the SC5 files, so a reader of the old shape still works.
import { buildCoreyOilWater } from '@/utils/scalCalculations';
import { scalUnits } from '@/utils/scalstudio/units';

const line = (cells) => cells.join(',');
const withHeader = (header, lines) => [...(header || []), ...lines].join('\n');

/** Working oil-water Corey set -> 25-point kr CSV (Sw,krw,kro). */
export function buildKrCsv(owParams, n = 25, { header = null } = {}) {
  if (!owParams) return null;
  const { rows } = buildCoreyOilWater(owParams, { n });
  return withHeader(header, [
    line(['Sw', 'krw', 'kro']),
    ...rows.map((r) => line([r.Sw.toFixed(4), r.krw.toFixed(5), r.kro.toFixed(5)])),
  ]);
}

/** Saturation-height profile -> CSV (height, TVDSS when a FWL is given, Sw, Pc), field units unless `system` says otherwise. */
export function buildHeightCsv(profileRows, fwlTvdss = null, { header = null, system = 'oilfield' } = {}) {
  if (!profileRows?.length) return null;
  const u = scalUnits(system);
  const hasFwl = Number.isFinite(fwlTvdss);
  const L = u.system === 'si' ? 'm' : 'ft';
  const P = u.system === 'si' ? 'kPa' : 'psi';
  const h = (v) => u.show('length', v);
  return withHeader(header, [
    line(hasFwl ? [`h_${L}`, `tvdss_${L}`, 'Sw', `Pc_${P}`] : [`h_${L}`, 'Sw', `Pc_${P}`]),
    ...profileRows.map((r) => line(hasFwl
      ? [h(r.h_ft).toFixed(2), h(fwlTvdss - r.h_ft).toFixed(2), r.Sw.toFixed(4), u.show('pc', r.Pc_psi).toFixed(4)]
      : [h(r.h_ft).toFixed(2), r.Sw.toFixed(4), u.show('pc', r.Pc_psi).toFixed(4)])),
  ]);
}

/** Reservoir Pc rows -> CSV (Sw, Pc in the display unit). */
export function buildPcCsv(pcRows, { header = null, system = 'oilfield' } = {}) {
  if (!pcRows?.length) return null;
  const u = scalUnits(system);
  return withHeader(header, [
    line(['Sw', u.system === 'si' ? 'Pc_kPa' : 'Pc_psi']),
    ...pcRows.map((r) => line([r.Sw.toFixed(4), u.show('pc', r.Pc_psi).toFixed(4)])),
  ]);
}

/**
 * Waterflood Design Studio handoff payload (navigate-state contract, the
 * WT5 pattern). Oil-water only; gas-oil sets are not handed off because the
 * Waterflood displacement is an oil-water calculation.
 */
export function buildScalKrHandoff({ owParams, projectName, muW, muO }) {
  if (!owParams) return null;
  return {
    source: projectName || 'SCAL Studio',
    krSource: 'corey',
    corey: {
      Swc: owParams.Swc, Sor: owParams.Sor,
      krwMax: owParams.krwMax, kroMax: owParams.kroMax,
      nw: owParams.nw, no: owParams.no,
    },
    muW: Number.isFinite(muW) ? muW : null,
    muO: Number.isFinite(muO) ? muO : null,
  };
}

export const downloadCsv = (text, filename) => {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
