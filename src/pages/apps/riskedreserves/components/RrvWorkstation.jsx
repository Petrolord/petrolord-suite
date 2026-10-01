// Risked Reserves Valuation workstation (T1 rebuild, 2026-09-26). The
// geologist risks a prospect in ReservoirCalc Pro (Pg and success-case
// volumes); here the committee values it: commercial chance against the
// minimum economic field size, expected monetary value after the
// exploration well, break-even Pg and the risked expectation curve, one
// prospect at a time and as a portfolio of independent prospects. Every
// number comes from the engines prospect valuation module.

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, HelpCircle, Plus, Download, Trash2, RefreshCw } from 'lucide-react';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { valueProspect, valuePortfolio, expectationCurve } from '@/utils/prospectValuation';
import ExpectationChart from './ExpectationChart';
import {
  fromRcpProspect, blankProspect, inputProblem, loadProspects, saveProspects, valuationCsv,
} from '../services/rrvStore';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const cell = 'w-full rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus';
const btn = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';
const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));
const pct = (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : `${(v * 100).toFixed(1)}%`);

const FIELDS = [
  ['pg', 'Pg', 'Geological chance of success (0 to 1), from the risking in ReservoirCalc Pro'],
  ['p90', 'P90', 'Success-case volume, low case, MMbbl'],
  ['p50', 'P50', 'Success-case volume, best case, MMbbl'],
  ['p10', 'P10', 'Success-case volume, high case, MMbbl'],
  ['mefs', 'MEFS', 'Minimum economic field size, MMbbl'],
  ['unitValue', '$/bbl', 'NPV per barrel of a developed discovery (from the Petroleum Economics Studio)'],
  ['devCost', 'Dev $MM', 'Development cost of a commercial discovery, $MM'],
  ['wellCost', 'Well $MM', 'Exploration well cost, $MM (spent in every outcome)'],
];

function RrvWorkstationContent({ backend }) {
  const [prospects, setProspects] = useState(loadProspects);
  const [inventory, setInventory] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('Ready.');

  useEffect(() => { saveProspects(prospects); }, [prospects]);
  useEffect(() => {
    let live = true;
    backend.listProspects()
      .then((rows) => { if (live) setInventory(rows); })
      .catch((e) => { if (live) { setInventory([]); setStatus(e.message); } });
    return () => { live = false; };
  }, [backend]);

  const valued = useMemo(() => prospects.map((p) => {
    const problem = inputProblem(p);
    if (problem) return { p, v: null, problem };
    try { return { p, v: valueProspect({ ...p, p50: p.p50 === '' ? undefined : p.p50 }), problem: null }; } catch (e) { return { p, v: null, problem: e.message }; }
  }), [prospects]);
  const portfolio = useMemo(() => valuePortfolio(valued.filter((r) => r.v).map((r) => r.v)), [valued]);
  const selected = valued.find((r) => r.p.id === selectedId) || valued[0] || null;
  const curve = useMemo(() => (selected?.v ? expectationCurve(selected.p) : null), [selected]);

  const importInventory = () => {
    const rows = (inventory || []).map(fromRcpProspect);
    const known = new Set(prospects.map((p) => p.id));
    const fresh = rows.filter((r) => !known.has(r.id));
    if (!fresh.length) { setStatus(inventory?.length ? 'Every ReservoirCalc Pro prospect is already here.' : 'Your ReservoirCalc Pro inventory is empty: risk a prospect there first, or add one here.'); return; }
    setProspects((ps) => [...ps, ...fresh]);
    setStatus(`Imported ${fresh.length} prospect${fresh.length === 1 ? '' : 's'} from ReservoirCalc Pro. Set the MEFS, value per barrel and costs for each.`);
  };
  const add = () => { const p = blankProspect(prospects.length + 1); setProspects((ps) => [...ps, p]); setSelectedId(p.id); };
  const patch = (id, k, v) => setProspects((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: k === 'name' ? v : (v === '' ? '' : v) } : p)));
  const remove = (id) => setProspects((ps) => ps.filter((p) => p.id !== id));
  const exportCsv = () => {
    const blob = new Blob([valuationCsv(valued)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'risked-valuation.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus('Exported the valuation as risked-valuation.csv.');
  };

  const v = selected?.v;
  return (
    <div className="h-full flex flex-col bg-pl-bg text-pl-text" data-testid="rrv">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
        <ModuleHomeLink module="reservoir" />
        <PieChart className="w-4 h-4 text-pl-primary-text" />
        <span className="text-sm font-semibold">Risked Reserves Valuation</span>
        <span className="text-[11px] text-pl-muted">commercial chance, EMV and the expectation curve for risked prospects</span>
        <button type="button" className={`${btn} ml-auto`} onClick={importInventory} disabled={inventory === null} data-testid="rrv-import">
          <RefreshCw className="w-3.5 h-3.5" /> Import from ReservoirCalc Pro{inventory ? ` (${inventory.length})` : ''}
        </button>
        <button type="button" className={btn} onClick={add} data-testid="rrv-add"><Plus className="w-3.5 h-3.5" /> Add prospect</button>
        <button type="button" className={btn} onClick={exportCsv} disabled={!prospects.length} data-testid="rrv-csv"><Download className="w-3.5 h-3.5" /> CSV</button>
        <Link to="/dashboard/apps/reservoir/risked-reserves-valuation/help" className={btn} data-testid="rrv-help"><HelpCircle className="w-3.5 h-3.5" /> Help</Link>
        <ThemeToggle className="h-7 w-7" />
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
        {!prospects.length ? (
          <div className="text-sm text-pl-muted p-6 text-center" data-testid="rrv-empty">
            Import the prospects you risked in ReservoirCalc Pro, or add one here, then set its minimum economic field size, value per barrel and costs.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-pl-border bg-pl-surface">
            <table className="w-full min-w-[960px] text-xs">
              <thead className="text-pl-muted">
                <tr>
                  <th className="text-left px-2 py-1">Prospect</th>
                  {FIELDS.map(([k, label, title]) => <th key={k} className="text-right px-1 py-1" title={title}>{label}</th>)}
                  <th className="text-right px-2 py-1" title="Commercial chance: Pg x P(volume >= MEFS)">Pc</th>
                  <th className="text-right px-2 py-1" title="Expected monetary value after the exploration well, $MM">EMV $MM</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {valued.map(({ p, v: pv, problem }) => (
                  <tr key={p.id} className={`border-t border-pl-border ${selected?.p.id === p.id ? 'bg-pl-primary/10' : ''}`} onClick={() => setSelectedId(p.id)} data-testid={`rrv-row-${p.name}`}>
                    <td className="px-2 py-1 min-w-[140px]">
                      <input className={cell} value={p.name} onChange={(e) => patch(p.id, 'name', e.target.value)} data-testid={`rrv-name-${p.name}`} />
                      <span className={`text-[10px] ${p.source === 'rcp' && p.basis !== 'recoverable' ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid={`rrv-note-${p.name}`}>{p.source === 'rcp' ? `from ReservoirCalc Pro${p.volumeNote ? `, ${p.volumeNote}` : ''}` : 'typed here'}</span>
                    </td>
                    {FIELDS.map(([k]) => (
                      <td key={k} className="px-1 py-1 w-[72px]">
                        <input className={`${cell} text-right font-pl-mono tabular-nums`} value={p[k]} inputMode="decimal" onChange={(e) => patch(p.id, k, e.target.value)} data-testid={`rrv-${k}-${p.name}`} />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-pl-mono tabular-nums" data-testid={`rrv-pc-${p.name}`}>{pv ? pct(pv.pc) : EMPTY_VALUE}</td>
                    <td className={`px-2 py-1 text-right font-pl-mono font-semibold tabular-nums ${pv && pv.emv < 0 ? 'text-pl-danger-text' : 'text-pl-success-text'}`} data-testid={`rrv-emv-${p.name}`}>
                      {pv ? fmt(pv.emv) : <span className="text-pl-warning-text font-normal" title={problem}>check inputs</span>}
                    </td>
                    <td className="px-1"><button type="button" title={`Remove ${p.name}`} className="text-pl-muted hover:text-pl-danger-text" onClick={(e) => { e.stopPropagation(); remove(p.id); }}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-pl-border text-pl-text" data-testid="rrv-portfolio">
                <tr>
                  <td className="px-2 py-1 font-semibold" colSpan={FIELDS.length + 1}>
                    Portfolio of {portfolio.count} independent prospect{portfolio.count === 1 ? '' : 's'}: risked mean {fmt(portfolio.riskedMean)} MMbbl,
                    {' '}expected commercial discoveries {fmt(portfolio.expectedCommercial, 2)}, chance of at least one {pct(portfolio.pAtLeastOneCommercial)}
                    {portfolio.count < valued.length && <span className="text-pl-warning-text font-normal"> ({valued.length - portfolio.count} left out until its inputs are fixed)</span>}
                  </td>
                  <td />
                  <td className={`px-2 py-1 text-right font-pl-mono font-semibold tabular-nums ${portfolio.emv < 0 ? 'text-pl-danger-text' : 'text-pl-success-text'}`} data-testid="rrv-portfolio-emv">{fmt(portfolio.emv)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {selected && selected.problem && (
          <p className="text-xs text-pl-warning-text" data-testid="rrv-problem">{selected.p.name}: {selected.problem}</p>
        )}
        {v && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-3">
            <ExpectationChart curve={curve} mefs={Number(selected.p.mefs)} pg={v.pg} successCase={v.successCase} />
            <div className="rounded border border-pl-border bg-pl-surface p-2 text-xs space-y-1" data-testid="rrv-readout">
              <div className="text-pl-text font-medium">{selected.p.name}</div>
              {[
                ['Geological chance Pg', pct(v.pg)],
                ['Chance of at least the MEFS if it works', pct(v.pCommercialGivenSuccess)],
                ['Commercial chance Pc', pct(v.pc)],
                ['Success-case mean (lognormal)', `${fmt(v.successCase.mean)} MMbbl`],
                ['Swanson mean (check)', v.successCase.swansonMean != null ? `${fmt(v.successCase.swansonMean)} MMbbl` : EMPTY_VALUE],
                ['Risked mean (Pg x mean)', `${fmt(v.riskedMean)} MMbbl`],
                ['Mean if commercial', v.meanIfCommercial != null ? `${fmt(v.meanIfCommercial)} MMbbl` : EMPTY_VALUE],
                ['NPV if commercial', v.npvIfCommercial != null ? `${fmt(v.npvIfCommercial)} $MM` : EMPTY_VALUE],
                ['EMV after the well', `${fmt(v.emv)} $MM`],
                ['Break-even Pg', v.breakEvenPg != null ? pct(v.breakEvenPg) : 'not reachable'],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-2"><span className="text-pl-muted">{k}</span><span className="font-pl-mono tabular-nums" data-testid={`rrv-out-${k}`}>{val}</span></div>
              ))}
              <p className="text-[10px] text-pl-muted pt-1">
                Volumes are the success case, the lognormal fitted to P90 and P10. The risked mean averages the dry hole in;
                it is never a volume anyone will find. Value per barrel comes from the Petroleum Economics Studio.
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="px-3 py-1 bg-pl-surface border-t border-pl-border text-[11px] text-pl-muted" data-testid="rrv-status">{status}</div>
    </div>
  );
}

// Design system rollout batch 3E: the workstation opens light and follows
// the user's theme choice from the toolbar toggle. The route page and the
// /dev harness both mount this component, so they share the one scope.
export default function RrvWorkstation(props) {
  return (
    <div className="h-full" data-testid="rrv-theme-scope">
      <RrvWorkstationContent {...props} />
    </div>
  );
}
