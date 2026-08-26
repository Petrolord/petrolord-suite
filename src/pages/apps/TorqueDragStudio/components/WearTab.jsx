// Casing wear tab: wear profile chart + interval table from the rotating
// T&D side forces (engine casingWear, crescent groove model).

import React from 'react';
import { WearChart } from '../charts/TdCharts';
import { depthOut, depthLabel } from '../services/tdRun';

export default function WearTab({ wear, depthUnit }) {
  if (!wear) {
    return (
      <div className="p-6 text-sm text-slate-400" data-testid="td-wear-empty">
        No wear result. Run an analysis with a rotating operation, a cased
        section in the geometry, and rotating hours in the wear schedule.
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-xs">
        <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="text-[9px] uppercase text-slate-500">Max wear depth</div>
          <div className="text-sm font-semibold text-slate-100" data-testid="td-wear-depth">
            {(wear.summary.maxWearDepthM * 1000).toFixed(2)} mm
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="text-[9px] uppercase text-slate-500">Max wall loss</div>
          <div className="text-sm font-semibold text-slate-100">{wear.summary.maxWallLossPct.toFixed(1)} %</div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="text-[9px] uppercase text-slate-500">Min remaining wall</div>
          <div className="text-sm font-semibold text-slate-100">{(wear.summary.minRemainingWallM * 1000).toFixed(2)} mm</div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="text-[9px] uppercase text-slate-500">Worst interval</div>
          <div className="text-sm font-semibold text-slate-100">
            {depthOut(wear.summary.worstFromMd, depthUnit).toFixed(0)}–{depthOut(wear.summary.worstToMd, depthUnit).toFixed(0)} {depthLabel(depthUnit)}
          </div>
        </div>
      </div>
      <div className="text-[10px] text-slate-500">{wear.summary.collapseNote}</div>
      <div className="min-h-0 flex-1" style={{ minHeight: 380 }}>
        <WearChart wear={wear} depthUnit={depthUnit} />
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <table className="w-full text-xs text-slate-300">
          <thead>
            <tr className="text-[10px] uppercase text-slate-500">
              <th className="p-1 text-right">From ({depthLabel(depthUnit)})</th>
              <th className="p-1 text-right">To ({depthLabel(depthUnit)})</th>
              <th className="p-1 text-right">Side force (kN)</th>
              <th className="p-1 text-right">Wear (mm)</th>
              <th className="p-1 text-right">Wall loss (%)</th>
              <th className="p-1 text-right">Remaining (mm)</th>
            </tr>
          </thead>
          <tbody>
            {wear.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-800">
                <td className="p-1 text-right">{depthOut(r.fromMd, depthUnit).toFixed(0)}</td>
                <td className="p-1 text-right">{depthOut(r.toMd, depthUnit).toFixed(0)}</td>
                <td className="p-1 text-right">{(r.sideForceN / 1e3).toFixed(2)}</td>
                <td className="p-1 text-right">{(r.wearDepthM * 1000).toFixed(2)}</td>
                <td className="p-1 text-right">{r.wallLossPct.toFixed(1)}</td>
                <td className="p-1 text-right">{(r.remainingWallM * 1000).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
