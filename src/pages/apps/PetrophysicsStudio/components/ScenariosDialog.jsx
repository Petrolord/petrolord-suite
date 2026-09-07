// Low, mid, high dialog (Petrophysics Studio PT9g): two editable
// parameter columns around the current (mid) set, a live zone table with
// the three cases side by side, and three ways out: draw the bands on
// the tracks, export the summary CSV, publish the _LOW/_HIGH curves.
// Every number is one deterministic pipeline run; nothing is sampled.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { saveAs } from 'file-saver';
import { FIELDS } from '../services/paramFields';
import { buildZoneTable, patchesFromDrafts } from '../services/zoneParamTable';
import {
  CASES, CASE_LABEL, defaultScenarios, runScenarios, scenarioSummaries, scenariosCsv, caseParams,
} from '../services/scenarios';
import ParamGrid from './ParamGrid';

const fmt = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const COLS = [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }];

export default function ScenariosDialog({
  open, onOpenChange, params, scenarios, curves, zoneParamList, zones = [], zoneParams = {}, depthUnit = 'm',
  wellName = 'Well', canPublish = false, onApply, onPublish, onStatus,
}) {
  const [draft, setDraft] = useState({});
  useEffect(() => {
    if (!open) return;
    const sc = scenarios || defaultScenarios(params);
    setDraft({ low: { ...params, ...sc.low }, high: { ...params, ...sc.high } });
  }, [open, params, scenarios]);

  const rows = useMemo(() => buildZoneTable({ params, zones: COLS, zoneParams: scenarios || {}, sections: FIELDS }), [params, scenarios]);
  const { patches, invalid } = useMemo(() => patchesFromDrafts(params, draft), [params, draft]);
  const invalidCount = Object.values(invalid).reduce((n, keys) => n + keys.length, 0);
  const setCell = (colId, key, value) => setDraft((d) => ({ ...d, [colId]: { ...d[colId], [key]: value } }));

  // live results on the draft (three runs of the zoned pipeline)
  const results = useMemo(() => {
    if (!curves || invalidCount || !draft.low) return null;
    try { return runScenarios(curves, params, zoneParamList || [], patches); } catch (e) { return null; }
  }, [curves, params, zoneParamList, patches, invalidCount, draft.low]);
  const summaries = useMemo(() => (results ? scenarioSummaries(curves, results, params, zones, zoneParams, patches) : null),
    [results, curves, params, zones, zoneParams, patches]);
  const F = depthUnit === 'ft' ? 1 / 0.3048 : 1;
  const nOver = (c) => Object.keys(patches[c] || {}).length;

  const apply = () => {
    if (invalidCount) return;
    onApply(patches);
    onStatus?.(`Applied the low and high cases (${nOver('low')} and ${nOver('high')} parameters changed); the Low, mid, high layout is active.`);
    onOpenChange(false);
  };
  const exportCsv = () => {
    if (!summaries) return;
    const blob = new Blob([scenariosCsv(zones, summaries, depthUnit)], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${String(wellName).replace(/[^\w.-]+/g, '_')}_scenarios.csv`);
    onStatus?.('Exported the low, mid, high zone summary CSV.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-auto bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-scenarios-dialog">
        <DialogHeader>
          <DialogTitle>Low, mid, high cases</DialogTitle>
          <DialogDescription className="text-slate-400">
            Mid is the current parameter set. Low and High are edits over it; a changed cell overrides
            that parameter in every zone. Each case is one ordinary pipeline run, so every curve and zone
            number below is explainable by the column it came from.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3 text-xs">
          <ParamGrid
            rows={rows}
            columns={COLS}
            params={params}
            draft={draft}
            invalid={invalid}
            onCell={setCell}
            testPrefix="petro-sc"
            globalLabel="Mid (current)"
          />
          <div className="rounded border border-slate-800 max-h-[60vh] overflow-auto">
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 bg-slate-900">
                <tr>
                  {['Zone', 'Case', `Net (${depthUnit})`, 'NTG', 'φe avg', 'Sw avg', 'k gm (mD)'].map((h) => (
                    <th key={h} className="text-left px-2 py-1 text-slate-400 font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.length === 0 && (
                  <tr><td colSpan={7} className="px-2 py-2 text-slate-500">No zones on this well yet; the cases still draw on the tracks.</td></tr>
                )}
                {zones.map((z) => CASES.map((c, i) => {
                  const s = summaries?.[z.id]?.[c];
                  return (
                    <tr key={`${z.id}-${c}`} className={i === 0 ? 'border-t border-slate-800/60' : ''} data-testid={`petro-sc-row-${z.name}-${c}`}>
                      <td className="px-2 py-0.5 text-slate-300">{i === 0 ? z.name : ''}</td>
                      <td className={`px-2 py-0.5 ${c === 'low' ? 'text-red-300' : c === 'high' ? 'text-emerald-300' : 'text-slate-200'}`}>{CASE_LABEL[c]}</td>
                      <td className="px-2 py-0.5" data-testid={`petro-sc-net-${z.name}-${c}`}>{s ? fmt(s.net_m * F, 1) : '—'}</td>
                      <td className="px-2 py-0.5">{s ? fmt(s.ntg) : '—'}</td>
                      <td className="px-2 py-0.5">{s ? fmt(s.phi_avg) : '—'}</td>
                      <td className="px-2 py-0.5">{s ? fmt(s.sw_avg) : '—'}</td>
                      <td className="px-2 py-0.5">{s ? fmt(s.k_gm_md, 1) : '—'}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
            {results && (
              <p className="px-2 py-1 text-[10px] text-slate-500">
                Low: {Object.entries(patches.low || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'no change'} ·
                High: {Object.entries(patches.high || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'no change'}
                {results.low.missing.length ? ` · low case missing: ${results.low.missing.join('; ')}` : ''}
                {' · '}Rw here is {fmt(caseParams(params, patches, 'low').rw, 4)} / {fmt(params.rw, 4)} / {fmt(caseParams(params, patches, 'high').rw, 4)}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center gap-2">
          <span className="mr-auto text-[11px] text-slate-500" data-testid="petro-scenarios-summary">
            {invalidCount ? `${invalidCount} cell(s) are not numbers` : `low changes ${nOver('low')}, high changes ${nOver('high')}`}
          </span>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" size="sm" data-testid="petro-scenarios-csv" disabled={!summaries || !zones.length} className="border-slate-700 text-slate-300" onClick={exportCsv}>
            Export summary CSV
          </Button>
          <Button
            variant="outline" size="sm" data-testid="petro-scenarios-publish"
            disabled={!canPublish || !results || invalidCount > 0}
            title={canPublish ? 'Write the _LOW and _HIGH curves to the registry' : 'Org-shared wells are read-only'}
            className="border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
            onClick={async () => { await onPublish(patches); onOpenChange(false); }}
          >
            Publish low/high curves
          </Button>
          <Button size="sm" data-testid="petro-scenarios-apply" disabled={!results || invalidCount > 0} className="bg-cyan-700 hover:bg-cyan-600 text-white" onClick={apply}>
            Apply to tracks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
