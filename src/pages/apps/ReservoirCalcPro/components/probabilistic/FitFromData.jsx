// Fit an input distribution from data (ReservoirCalc Pro upgrade U2-017):
// paste the values, see each candidate ranked by its Kolmogorov-Smirnov
// distance to the data, and use one for the input.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { parseValues, fitDistributions, toPanelDist } from '../../services/distributionFit';

const f4 = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(4))) : 'n/a');
const FRACTIONS = new Set(['porosity', 'sw', 'ntg', 'gasCapFraction']);
const describe = (d) => (d.type === 'normal' || d.type === 'lognormal' ? `mean ${f4(d.mean)}, sd ${f4(d.stdDev)}`
  : d.type === 'uniform' ? `${f4(d.min)} to ${f4(d.max)}` : `min ${f4(d.min)}, most likely ${f4(d.mode)}, max ${f4(d.max)}`);

export default function FitFromData({ keys, labelOf, onUse }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(keys[0]);
  const [text, setText] = useState('');
  const [fit, setFit] = useState(null);
  const run = () => {
    const { values, skipped } = parseValues(text);
    const r = fitDistributions(values, { fraction: FRACTIONS.has(key) });
    setFit({ ...r, skipped });
  };
  return (
    <div className="p-2 bg-pl-sunken rounded border border-pl-border space-y-1.5" data-testid="rcp-fit">
      <button type="button" className="text-[11px] font-bold text-pl-text" onClick={() => setOpen((o) => !o)} data-testid="rcp-fit-open">
        {open ? 'Hide' : 'Fit a distribution from data'}
      </button>
      {open && (
        <>
          <select className="h-7 w-full rounded border border-pl-border bg-pl-surface px-1 text-[11px] text-pl-text" value={key} onChange={(e) => { setKey(e.target.value); setFit(null); }} data-testid="rcp-fit-key">
            {keys.map((k) => <option key={k} value={k}>{labelOf(k)}</option>)}
          </select>
          <textarea className="w-full rounded border border-pl-border bg-pl-surface px-2 py-1 font-mono text-[11px] text-pl-text" rows={4}
            placeholder="Paste values (porosity of each well, analogue recovery factors...), separated by commas, spaces or lines"
            value={text} onChange={(e) => setText(e.target.value)} data-testid="rcp-fit-text" />
          <Button size="sm" className="h-7 text-[11px]" onClick={run} data-testid="rcp-fit-run">Fit</Button>
          {fit && !fit.ok && <p className="text-[10px] text-pl-danger-text" data-testid="rcp-fit-error">{fit.reason}</p>}
          {fit?.ok && (
            <div className="space-y-1" data-testid="rcp-fit-result">
              <p className="text-[10px] text-pl-muted">{fit.n} values{fit.skipped ? ` (${fit.skipped} not numbers, left out)` : ''}; ranked by the Kolmogorov-Smirnov distance (smaller fits better; above {f4(fit.ksCritical)} the shape is a poor fit).</p>
              {fit.candidates.map((c, i) => (
                <div key={c.type} className="flex items-center gap-1 text-[10px]" data-testid={`rcp-fit-cand-${c.type}`}>
                  <span className={`w-16 capitalize ${i === 0 ? 'font-bold text-pl-text' : 'text-pl-muted'}`}>{c.type}</span>
                  <span className="flex-1 text-pl-text">{describe(c.dist)}{c.note ? `; ${c.note}` : ''}</span>
                  <span className={`w-14 text-right font-mono ${c.ks > fit.ksCritical ? 'text-pl-warning-text' : 'text-pl-muted'}`}>KS {c.ks.toFixed(3)}</span>
                  <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => onUse(key, toPanelDist(c.dist))} data-testid={`rcp-fit-use-${c.type}`}>Use</Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
