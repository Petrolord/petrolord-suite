// Tubing Sizing tab: candidate API 5CT tubing sizes screened with the
// Production module's validated nodal VLP engine (src/utils/nodal, its
// native oilfield units) at the design rate and wellhead pressure. This is
// a sizing screen, not nodal matching — the cross-links go to the real
// thing.

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { tubingSizingTable } from '../services/cdRun';

const FIELDS = [
  ['qoStbd', 'Design rate (stb/d)'],
  ['whpPsi', 'WHP (psi)'],
  ['wct', 'Water cut (0-1)'],
  ['gor', 'GOR (scf/stb)'],
  ['api', 'Oil API'],
  ['gasSg', 'Gas SG'],
  ['whtF', 'WHT (°F)'],
  ['bhtF', 'BHT (°F)'],
];

const CORRELATIONS = ['beggsBrill', 'hagedornBrown', 'gray', 'fancherBrown', 'noSlip'];

export default function TubingSizingTab({ caseDraft, onCaseChange, stations, res }) {
  const sizing = caseDraft.params?.sizing || {};
  const nodeMdM = res?.packerMdM ?? 3000;

  const table = useMemo(() => {
    try {
      return { data: tubingSizingTable({ sizing, stations, nodeMdM }), error: null };
    } catch (e) {
      return { data: null, error: e.message };
    }
  }, [sizing, stations, nodeMdM]);

  // Tubing components carry the coupling OD as their run-in OD, so the
  // in-string match is by ID (unique per catalog row).
  const currentIdIn = (caseDraft.string?.components || []).find((c) => c.type === 'tubing')?.idIn ?? null;
  const inString = (r) => currentIdIn != null && Math.abs(r.idIn - currentIdIn) < 1e-6;

  return (
    <div className="space-y-3 p-3">
      <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Design point</span>
          <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300">Production nodal engine</span>
          <span className="text-[10px] text-slate-500">node at the packer, {Math.round(nodeMdM)} m MD</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          {FIELDS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-1">
              {label}
              <Input type="number" step="any" value={sizing[k] ?? ''}
                onChange={(e) => onCaseChange((d) => { d.params.sizing[k] = parseFloat(e.target.value) || 0; })}
                className="h-6 w-20 bg-slate-900 border-slate-700 text-right font-mono text-[11px]"
                data-testid={`cd-sizing-${k}`} />
            </label>
          ))}
          <label className="flex items-center gap-1">
            Correlation
            <Select value={sizing.correlation || 'beggsBrill'}
              onValueChange={(v) => onCaseChange((d) => { d.params.sizing.correlation = v; })}>
              <SelectTrigger className="h-6 w-36 bg-slate-900 border-slate-700 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {CORRELATIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>

      {table.error && <div className="rounded border border-red-800 bg-red-950/40 p-2 text-xs text-red-300">{table.error}</div>}

      {table.data && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-1 py-1 text-left">Tubing</th>
                <th className="px-1 py-1 text-right">ID (in)</th>
                <th className="px-1 py-1 text-right">Flowing BHP (psi)</th>
                <th className="px-1 py-1 text-right">Friction ΔP (psi)</th>
                <th className="px-1 py-1 text-left" />
              </tr>
            </thead>
            <tbody data-testid="cd-sizing-rows">
              {table.data.rows.map((r) => (
                <tr key={r.designation}
                  className={`border-t border-slate-800 ${inString(r) ? 'bg-lime-500/10 text-lime-200' : 'text-slate-300'}`}>
                  <td className="px-1 py-1">{r.designation}{inString(r) ? ' (in string)' : ''}</td>
                  <td className="px-1 py-1 text-right font-mono">{r.idIn.toFixed(3)}</td>
                  <td className="px-1 py-1 text-right font-mono" data-testid={`cd-sizing-bhp-${r.odIn}`}>
                    {r.bhpPsi == null ? 'no solution' : r.bhpPsi.toFixed(0)}
                  </td>
                  <td className="px-1 py-1 text-right font-mono">{r.frictionPsi == null ? '—' : r.frictionPsi.toFixed(0)}</td>
                  <td className="px-1 py-1 text-[10px] text-slate-500">{r.warnings?.[0] || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-slate-500">
            Flowing BHP the reservoir must deliver at the node for this rate and wellhead pressure; lower is easier. Whether the reservoir can deliver it is an inflow question:
            {' '}<Link to="/dashboard/apps/production/nodal-analysis-studio" className="text-cyan-400 hover:underline">match the operating point in Nodal Analysis Studio</Link>,
            and take stress and packer forces from <Link to="/dashboard/apps/drilling/casing-tubing-design-pro" className="text-cyan-400 hover:underline">Casing &amp; Tubing Design Studio</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
