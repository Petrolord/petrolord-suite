// A Basin & Charge Modeling pressure handed to Pore Pressure Studio
// (BF-U2-015, contract src/lib/basinPressure.js). Shown when the page opens
// with ?bfPressure=<id>: the model, its depth reference, the declared unit
// read through src/lib/ppfgUnits.js, and the hydrostatic, pore and overburden
// pressure by depth, as a reference beside this app's own prognosis.

import React, { useMemo } from 'react';
import { readBasinPressure } from '@/lib/basinPressure';

const PSI_PER_MPA = 145.03773773020923;

export default function BasinPressureNote() {
  const id = useMemo(() => { try { return new URLSearchParams(window.location.search).get('bfPressure'); } catch { return null; } }, []);
  const read = useMemo(() => (id ? readBasinPressure(id) : null), [id]);
  if (!read) return null;
  if (!read.ok) return <div className="m-2 p-2 rounded border border-pl-warning/40 bg-pl-warning-bg text-[11px] text-pl-warning-text" data-testid="pp-bf-pressure-error">{read.reason}</div>;
  const { payload: p, rows } = read;
  const step = Math.max(1, Math.ceil(rows.length / 12));
  const shown = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);
  const maxOp = Math.max(...rows.map((r) => r.poreMpa - r.hydrostaticMpa));
  const ref = p.topTvdBelowKbM != null ? `TVD below the model surface, which is ${p.topTvdBelowKbM.toFixed(0)} m TVD below KB at ${p.model.registryWellName}` : 'TVD below the model surface (the model is not tied to a registry well)';
  return (
    <div className="m-2 p-2 rounded border border-pl-border bg-pl-sunken text-[11px] text-pl-text space-y-1" data-testid="pp-bf-pressure">
      <div className="font-semibold">Basin model pressure: {p.model.name}</div>
      <div className="text-pl-muted">Depth: {ref}. Declared unit {p.unit.pressure}, read as MPa. Overpressure up to {maxOp.toFixed(1)} MPa ({(maxOp * PSI_PER_MPA).toFixed(0)} psi).</div>
      <table className="w-full font-mono" data-testid="pp-bf-pressure-table">
        <thead><tr className="text-pl-muted text-left"><th className="font-normal">TVD (m)</th><th className="font-normal">Hydrostatic</th><th className="font-normal">Pore</th><th className="font-normal">Overburden (MPa)</th></tr></thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className="border-t border-pl-border"><td>{r.tvdM.toFixed(0)}</td><td>{r.hydrostaticMpa.toFixed(2)}</td><td>{r.poreMpa.toFixed(2)}</td><td>{r.overburdenMpa.toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
      {(p.notes || []).map((n, i) => <div key={i} className="text-pl-muted">{n}</div>)}
    </div>
  );
}
