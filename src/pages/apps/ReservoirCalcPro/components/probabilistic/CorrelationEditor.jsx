// Correlation editor for the Monte Carlo (ReservoirCalc Pro upgrade U2-002).
// Pairs of uncertain inputs and their correlation coefficient in the
// Gaussian copula the canonical engine samples with. A set of pairs that
// cannot hold together (not positive semidefinite) is refused with the
// reason, and the run is blocked until it is fixed.
import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { correlationMatrixProblem } from '@/lib/monteCarlo';
import NumberField from '../common/NumberField';

/** The reason a list of pairs cannot be used, or null. */
export function correlationsProblem(pairs, labelOf = (k) => k) {
  const keys = [];
  for (const p of pairs || []) {
    if (!p.a || !p.b) return 'Pick both variables of every pair.';
    if (p.a === p.b) return `A variable cannot be correlated with itself (${labelOf(p.a)}).`;
    const r = Number(p.rho);
    if (!Number.isFinite(r) || r <= -1 || r >= 1) return `The correlation of ${labelOf(p.a)} with ${labelOf(p.b)} must be between -1 and 1 (not inclusive).`;
    for (const k of [p.a, p.b]) if (!keys.includes(k)) keys.push(k);
  }
  const seen = new Set();
  for (const p of pairs || []) {
    const id = [p.a, p.b].sort().join('|');
    if (seen.has(id)) return `${labelOf(p.a)} and ${labelOf(p.b)} are paired twice.`;
    seen.add(id);
  }
  const n = keys.length;
  const C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  for (const p of pairs || []) {
    const i = keys.indexOf(p.a); const j = keys.indexOf(p.b);
    C[i][j] = Number(p.rho); C[j][i] = Number(p.rho);
  }
  return correlationMatrixProblem(C, keys.map(labelOf));
}

export default function CorrelationEditor({ keys, labelOf, value, onChange, problem }) {
  const set = (k, patch) => onChange(value.map((p, i) => (i === k ? { ...p, ...patch } : p)));
  const add = () => {
    const a = keys[0]; const b = keys.find((k) => k !== a) || keys[0];
    onChange([...value, { a, b, rho: 0 }]);
  };
  return (
    <div className="p-3 bg-pl-sunken rounded border border-pl-border space-y-2" data-testid="rcp-corr">
      <Label className="text-xs font-bold text-pl-text">Correlations</Label>
      <p className="text-[10px] text-pl-muted">Correlation of the normal scores in the Gaussian copula (close to the rank correlation). A pair with an input that has no spread is not applied, and the run says so.</p>
      {value.length === 0 && <p className="text-[10px] text-pl-muted">No correlations: every input is sampled independently.</p>}
      {value.map((p, k) => (
        <div key={k} className="flex items-center gap-1" data-testid={`rcp-corr-row-${k}`}>
          <select className="h-7 flex-1 min-w-0 rounded border border-pl-border bg-pl-surface text-[10px] text-pl-text" value={p.a} onChange={(e) => set(k, { a: e.target.value })} aria-label="First variable">
            {keys.map((key) => <option key={key} value={key}>{labelOf(key)}</option>)}
          </select>
          <select className="h-7 flex-1 min-w-0 rounded border border-pl-border bg-pl-surface text-[10px] text-pl-text" value={p.b} onChange={(e) => set(k, { b: e.target.value })} aria-label="Second variable">
            {keys.map((key) => <option key={key} value={key}>{labelOf(key)}</option>)}
          </select>
          <NumberField className="h-7 w-16 text-xs text-center" value={p.rho} onCommit={(v) => set(k, { rho: v ?? 0 })} data-testid={`rcp-corr-rho-${k}`} aria-label="Correlation" />
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => onChange(value.filter((_, i) => i !== k))}>Remove</Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-7 text-[10px]" data-testid="rcp-corr-add" onClick={add} disabled={keys.length < 2}>Add a pair</Button>
      {problem && <p className="text-[10px] text-pl-danger-text" data-testid="rcp-corr-problem">{problem}</p>}
    </div>
  );
}
