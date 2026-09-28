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
// CD-T1-003: names, not code keys, in the picker
const CORRELATION_NAMES = {
  beggsBrill: 'Beggs & Brill', hagedornBrown: 'Hagedorn & Brown', gray: 'Gray (wet gas)',
  fancherBrown: 'Fancher & Brown', noSlip: 'No slip',
};

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
      <div className="rounded border border-pl-border bg-pl-surface p-2">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-pl-muted">Design point</span>
          <span className="rounded bg-pl-sunken px-1.5 py-0.5 text-[10px] text-pl-muted">Production nodal engine</span>
          <span className="text-[10px] text-pl-muted">node at the packer, {Math.round(nodeMdM)} m MD</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-pl-muted">
          {FIELDS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-1">
              {label}
              <Input type="number" step="any" value={sizing[k] ?? ''}
                onChange={(e) => onCaseChange((d) => { d.params.sizing[k] = parseFloat(e.target.value) || 0; })}
                className="h-6 w-20 text-right font-pl-mono text-[11px]"
                data-testid={`cd-sizing-${k}`} />
            </label>
          ))}
          <label className="flex items-center gap-1">
            Correlation
            <Select value={sizing.correlation || 'beggsBrill'}
              onValueChange={(v) => onCaseChange((d) => { d.params.sizing.correlation = v; })}>
              <SelectTrigger className="h-6 w-44 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent className="">
                {CORRELATIONS.map((c) => <SelectItem key={c} value={c}>{CORRELATION_NAMES[c] || c}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>

      {table.error && <div className="rounded border border-pl-danger bg-pl-danger-bg p-2 text-xs text-pl-danger-text">{table.error}</div>}

      {table.data && (
        <div className="rounded border border-pl-border bg-pl-surface p-2">
          <table className="w-full text-xs">
            <thead className="text-pl-muted">
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
                  className={`border-t border-pl-border ${inString(r) ? 'bg-pl-primary/10 text-pl-primary-text' : 'text-pl-text'}`}>
                  <td className="px-1 py-1">{r.designation}{inString(r) ? ' (in string)' : ''}</td>
                  <td className="px-1 py-1 text-right font-pl-mono">{r.idIn.toFixed(3)}</td>
                  <td className="px-1 py-1 text-right font-pl-mono" data-testid={`cd-sizing-bhp-${r.odIn}`}>
                    {r.bhpPsi == null ? 'no solution' : r.bhpPsi.toFixed(0)}
                  </td>
                  <td className="px-1 py-1 text-right font-pl-mono">{r.frictionPsi == null ? '--' : r.frictionPsi.toFixed(0)}</td>
                  <td className="px-1 py-1 text-[10px] text-pl-muted">{r.warnings?.[0] || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-pl-muted">
            Flowing BHP the reservoir must deliver at the node for this rate and wellhead pressure; lower is easier. Whether the reservoir can deliver it is an inflow question:
            {' '}<Link to="/dashboard/apps/production/nodal-analysis-studio" className="text-pl-primary-text hover:underline">match the operating point in Nodal Analysis Studio</Link>,
            and take stress and packer forces from <Link to="/dashboard/apps/drilling/casing-tubing-design-pro" className="text-pl-primary-text hover:underline">Casing &amp; Tubing Design Studio</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
