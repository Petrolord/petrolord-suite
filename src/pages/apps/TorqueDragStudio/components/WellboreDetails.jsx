// Wellbore details for the Drilling studios' explorers (tester fix
// 2026-09-07): the well list used to show a name and nothing else. This
// block shows where the trajectory comes from (definitive design, actual
// survey composite, latest draft, registry survey, or nothing and what to
// do), the wellbore header (datum, elevations, wellhead, north reference)
// and the survey listing in the wellbore's depth unit. Shared by Torque &
// Drag (Explorer) and Casing & Tubing (LeftPanel); read-only.

import React, { useMemo, useState } from 'react';
import { computeActualTable } from '../../well-planning/services/surveyUtils';
import { trajectorySummary } from '../../well-planning/services/trajectorySource';

const FT = 0.3048;
const disp = (m, unit) => (Number.isFinite(m) ? (unit === 'ft' ? m / FT : m) : NaN);
const fmt = (m, unit, digits = 0) => (Number.isFinite(m) ? `${disp(m, unit).toFixed(digits)} ${unit}` : 'n/a');

const TONE = {
  definitive: 'border-slate-700 text-slate-300',
  actual: 'border-cyan-500/50 text-cyan-300',
  draft: 'border-amber-500/50 text-amber-300',
  registry: 'border-cyan-500/50 text-cyan-300',
  none: 'border-red-500/50 text-red-300',
};

export default function WellboreDetails({ trajectory, wellbore: wellboreIn = null, testPrefix = 'td', maxRows = 400 }) {
  const wellbore = trajectory?.wellbore || wellboreIn;
  const [open, setOpen] = useState(false);
  const stations = useMemo(() => (Array.isArray(trajectory?.stations) ? trajectory.stations : []), [trajectory]);
  const unit = wellbore?.depth_unit === 'ft' ? 'ft' : 'm';
  const source = trajectory?.source || (trajectory?.design ? 'definitive' : 'none');
  const label = trajectory?.label || (trajectory?.design
    ? `${trajectory.design.name} r${trajectory.design.revision} (definitive), ${stations.length} stations`
    : 'No trajectory');
  const summary = useMemo(() => trajectorySummary(stations), [stations]);
  const table = useMemo(() => {
    if (!open || stations.length < 2) return null;
    try { return computeActualTable(stations, { kbM: Number(wellbore?.kb_elev_m) || 0 }); } catch { return null; }
  }, [open, stations, wellbore]);
  const tdTvdM = useMemo(() => {
    if (stations.length < 2) return NaN;
    try { const t = computeActualTable(stations, { kbM: Number(wellbore?.kb_elev_m) || 0 }); const last = t && t[t.length - 1]; return last ? Number(last.tvd) : NaN; } catch { return NaN; }
  }, [stations, wellbore]);
  if (!wellbore) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-slate-800 pt-2 text-[10px] text-slate-400" data-testid={`${testPrefix}-wellbore-details`}>
      <div className={`rounded border px-2 py-1 ${TONE[source] || TONE.none}`} data-testid={`${testPrefix}-traj-info`} data-source={source}>
        <div className="font-semibold">Trajectory: {label}</div>
        {trajectory?.note ? <div className="mt-0.5 text-[10px] opacity-90" data-testid={`${testPrefix}-traj-note`}>{trajectory.note}</div> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5" data-testid={`${testPrefix}-wellbore-header`}>
        <span className="text-slate-500">Depth unit</span><span className="text-slate-200">{unit}</span>
        <span className="text-slate-500">KB above MSL</span><span className="text-slate-200">{fmt(Number(wellbore.kb_elev_m), unit, 1)}</span>
        {Number.isFinite(Number(wellbore.ground_elev_m)) && wellbore.ground_elev_m != null && (<><span className="text-slate-500">Ground level</span><span className="text-slate-200">{fmt(Number(wellbore.ground_elev_m), unit, 1)}</span></>)}
        {Number.isFinite(Number(wellbore.water_depth_m)) && wellbore.water_depth_m != null && (<><span className="text-slate-500">Water depth</span><span className="text-slate-200">{fmt(Number(wellbore.water_depth_m), unit, 1)}</span></>)}
        <span className="text-slate-500">Azimuth reference</span><span className="text-slate-200">{wellbore.azimuth_reference || 'grid'}</span>
        {Number.isFinite(Number(wellbore.head_x)) && wellbore.head_x != null && (<><span className="text-slate-500">Wellhead X, Y</span><span className="text-slate-200">{Number(wellbore.head_x).toFixed(1)}, {Number(wellbore.head_y).toFixed(1)}</span></>)}
        {wellbore.uwi ? (<><span className="text-slate-500">UWI</span><span className="text-slate-200">{wellbore.uwi}</span></>) : null}
        <span className="text-slate-500">Status</span><span className="text-slate-200">{wellbore.status || 'planning'}</span>
        {wellbore.geo_well_id ? (<><span className="text-slate-500">Registry</span><span className="text-slate-200">linked</span></>) : null}
        {summary && (<>
          <span className="text-slate-500">TD (MD)</span><span className="text-slate-200" data-testid={`${testPrefix}-wellbore-td`}>{fmt(summary.tdMdM, unit)}</span>
          <span className="text-slate-500">TD (TVD)</span><span className="text-slate-200">{fmt(tdTvdM, unit)}</span>
          <span className="text-slate-500">Max inclination</span><span className="text-slate-200">{summary.maxIncDeg.toFixed(1)}°</span>
          <span className="text-slate-500">Stations</span><span className="text-slate-200">{summary.stationCount}</span>
        </>)}
      </div>
      {stations.length >= 2 && (
        <button type="button" onClick={() => setOpen((v) => !v)} data-testid={`${testPrefix}-survey-toggle`} className="text-cyan-300 hover:underline">
          {open ? 'Hide survey listing' : 'Show survey listing'}
        </button>
      )}
      {open && table && (
        <div className="max-h-64 overflow-auto rounded border border-slate-800" data-testid={`${testPrefix}-survey-table`}>
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-slate-900 text-slate-500">
              <tr><th className="px-1 text-left">MD ({unit})</th><th className="px-1 text-right">Inc</th><th className="px-1 text-right">Azi</th><th className="px-1 text-right">TVD ({unit})</th><th className="px-1 text-right">DLS ({unit === 'ft' ? '°/100ft' : '°/30m'})</th></tr>
            </thead>
            <tbody>
              {table.slice(0, maxRows).map((r, i) => (
                <tr key={i} className="text-slate-300">
                  <td className="px-1 font-mono">{disp(r.md, unit).toFixed(unit === 'ft' ? 0 : 1)}</td>
                  <td className="px-1 text-right font-mono">{Number(r.inc).toFixed(1)}</td>
                  <td className="px-1 text-right font-mono">{Number(r.azi).toFixed(1)}</td>
                  <td className="px-1 text-right font-mono">{disp(r.tvd, unit).toFixed(unit === 'ft' ? 0 : 1)}</td>
                  <td className="px-1 text-right font-mono">{Number.isFinite(Number(unit === 'ft' ? r.dls100ft : r.dls30m)) ? Number(unit === 'ft' ? r.dls100ft : r.dls30m).toFixed(2) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {table.length > maxRows && <div className="px-1 py-0.5 text-slate-500">{table.length - maxRows} more stations not listed.</div>}
        </div>
      )}
    </div>
  );
}
