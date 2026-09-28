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
import { useThemeClass } from '@/design/themeClass';

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

// Design system (rollout W0B): the same tones as status roles inside an
// opted-in app. Outside a <ThemedApp> scope tc() returns the legacy
// strings above and everything below unchanged.
const TONE_THEMED = {
  definitive: 'border-pl-border text-pl-text',
  actual: 'border-pl-info/50 bg-pl-info-bg text-pl-info-text',
  draft: 'border-pl-warning/50 bg-pl-warning-bg text-pl-warning-text',
  registry: 'border-pl-info/50 bg-pl-info-bg text-pl-info-text',
  none: 'border-pl-danger/50 bg-pl-danger-bg text-pl-danger-text',
};
const toneKey = (source) => (TONE[source] ? source : 'none');

export default function WellboreDetails({ trajectory, wellbore: wellboreIn = null, testPrefix = 'td', maxRows = 400 }) {
  const wellbore = trajectory?.wellbore || wellboreIn;
  const tc = useThemeClass();
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
  const LABEL = tc('text-slate-500', 'text-pl-muted');
  const VALUE = tc('text-slate-200', 'text-pl-text');

  return (
    <div className={tc('mt-3 space-y-2 border-t border-slate-800 pt-2 text-[10px] text-slate-400', 'mt-3 space-y-2 border-t border-pl-border pt-2 text-[10px] text-pl-muted')} data-testid={`${testPrefix}-wellbore-details`}>
      <div className={`rounded border px-2 py-1 ${tc(TONE[toneKey(source)], TONE_THEMED[toneKey(source)])}`} data-testid={`${testPrefix}-traj-info`} data-source={source}>
        <div className="font-semibold">Trajectory: {label}</div>
        {trajectory?.note ? <div className="mt-0.5 text-[10px] opacity-90" data-testid={`${testPrefix}-traj-note`}>{trajectory.note}</div> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5" data-testid={`${testPrefix}-wellbore-header`}>
        <span className={LABEL}>Depth unit</span><span className={VALUE}>{unit}</span>
        <span className={LABEL}>KB above MSL</span><span className={VALUE}>{fmt(Number(wellbore.kb_elev_m), unit, 1)}</span>
        {Number.isFinite(Number(wellbore.ground_elev_m)) && wellbore.ground_elev_m != null && (<><span className={LABEL}>Ground level</span><span className={VALUE}>{fmt(Number(wellbore.ground_elev_m), unit, 1)}</span></>)}
        {Number.isFinite(Number(wellbore.water_depth_m)) && wellbore.water_depth_m != null && (<><span className={LABEL}>Water depth</span><span className={VALUE}>{fmt(Number(wellbore.water_depth_m), unit, 1)}</span></>)}
        <span className={LABEL}>Azimuth reference</span><span className={VALUE}>{wellbore.azimuth_reference || 'grid'}</span>
        {Number.isFinite(Number(wellbore.head_x)) && wellbore.head_x != null && (<><span className={LABEL}>Wellhead X, Y</span><span className={VALUE}>{Number(wellbore.head_x).toFixed(1)}, {Number(wellbore.head_y).toFixed(1)}</span></>)}
        {wellbore.uwi ? (<><span className={LABEL}>UWI</span><span className={VALUE}>{wellbore.uwi}</span></>) : null}
        <span className={LABEL}>Status</span><span className={VALUE}>{wellbore.status || 'planning'}</span>
        {wellbore.geo_well_id ? (<><span className={LABEL}>Registry</span><span className={VALUE}>linked</span></>) : null}
        {summary && (<>
          <span className={LABEL}>TD (MD)</span><span className={VALUE} data-testid={`${testPrefix}-wellbore-td`}>{fmt(summary.tdMdM, unit)}</span>
          <span className={LABEL}>TD (TVD)</span><span className={VALUE}>{fmt(tdTvdM, unit)}</span>
          <span className={LABEL}>Max inclination</span><span className={VALUE}>{summary.maxIncDeg.toFixed(1)}°</span>
          <span className={LABEL}>Stations</span><span className={VALUE}>{summary.stationCount}</span>
        </>)}
      </div>
      {stations.length >= 2 && (
        <button type="button" onClick={() => setOpen((v) => !v)} data-testid={`${testPrefix}-survey-toggle`} className={tc('text-cyan-300 hover:underline', 'text-pl-primary-text hover:underline')}>
          {open ? 'Hide survey listing' : 'Show survey listing'}
        </button>
      )}
      {open && table && (
        <div className={tc('max-h-64 overflow-auto rounded border border-slate-800', 'max-h-64 overflow-auto rounded border border-pl-border bg-pl-surface')} data-testid={`${testPrefix}-survey-table`}>
          <table className="w-full text-[10px]">
            <thead className={tc('sticky top-0 bg-slate-900 text-slate-500', 'sticky top-0 bg-pl-sunken text-pl-muted')}>
              <tr><th className="px-1 text-left">MD ({unit})</th><th className="px-1 text-right">Inc</th><th className="px-1 text-right">Azi</th><th className="px-1 text-right">TVD ({unit})</th><th className="px-1 text-right">DLS ({unit === 'ft' ? '°/100ft' : '°/30m'})</th></tr>
            </thead>
            <tbody>
              {table.slice(0, maxRows).map((r, i) => (
                <tr key={i} className={tc('text-slate-300', 'text-pl-text')}>
                  <td className="px-1 font-mono">{disp(r.md, unit).toFixed(unit === 'ft' ? 0 : 1)}</td>
                  <td className="px-1 text-right font-mono">{Number(r.inc).toFixed(1)}</td>
                  <td className="px-1 text-right font-mono">{Number(r.azi).toFixed(1)}</td>
                  <td className="px-1 text-right font-mono">{disp(r.tvd, unit).toFixed(unit === 'ft' ? 0 : 1)}</td>
                  <td className="px-1 text-right font-mono">{Number.isFinite(Number(unit === 'ft' ? r.dls100ft : r.dls30m)) ? Number(unit === 'ft' ? r.dls100ft : r.dls30m).toFixed(2) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {table.length > maxRows && <div className={tc('px-1 py-0.5 text-slate-500', 'px-1 py-0.5 text-pl-muted')}>{table.length - maxRows} more stations not listed.</div>}
        </div>
      )}
    </div>
  );
}
