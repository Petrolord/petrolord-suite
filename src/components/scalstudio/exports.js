// Export tab glue (SC5): pure CSV builders and the Waterflood handoff
// payload. Jest-guarded; the tab component only downloads/navigates.
import { buildCoreyOilWater } from '@/utils/scalCalculations';

const line = (cells) => cells.join(',');

/** Working oil-water Corey set -> 25-point kr CSV (Sw,krw,kro). */
export function buildKrCsv(owParams, n = 25) {
  if (!owParams) return null;
  const { rows } = buildCoreyOilWater(owParams, { n });
  return [
    line(['Sw', 'krw', 'kro']),
    ...rows.map((r) => line([r.Sw.toFixed(4), r.krw.toFixed(5), r.kro.toFixed(5)])),
  ].join('\n');
}

/** Saturation-height profile -> CSV (h_ft, tvdss_ft when FWL given, Sw, Pc_psi). */
export function buildHeightCsv(profileRows, fwlTvdss = null) {
  if (!profileRows?.length) return null;
  const hasFwl = Number.isFinite(fwlTvdss);
  return [
    line(hasFwl ? ['h_ft', 'tvdss_ft', 'Sw', 'Pc_psi'] : ['h_ft', 'Sw', 'Pc_psi']),
    ...profileRows.map((r) => line(hasFwl
      ? [r.h_ft.toFixed(2), (fwlTvdss - r.h_ft).toFixed(2), r.Sw.toFixed(4), r.Pc_psi.toFixed(4)]
      : [r.h_ft.toFixed(2), r.Sw.toFixed(4), r.Pc_psi.toFixed(4)])),
  ].join('\n');
}

/** Reservoir Pc rows -> CSV (Sw,Pc_psi). */
export function buildPcCsv(pcRows) {
  if (!pcRows?.length) return null;
  return [
    line(['Sw', 'Pc_psi']),
    ...pcRows.map((r) => line([r.Sw.toFixed(4), r.Pc_psi.toFixed(4)])),
  ].join('\n');
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
