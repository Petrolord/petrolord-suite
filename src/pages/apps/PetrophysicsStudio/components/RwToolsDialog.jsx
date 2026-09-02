// Rw quicklook tools (Petrophysics Studio PS5): the SP quicklook and
// the Arps temperature converter, wiring the engine functions that
// were validated in G2 but never had a UI. Inputs are degC; the SP and
// Arps formulas are defined in degF so the module converts at this
// boundary and the copy says so. The SP chain shows the documented
// quicklook approximation (Rwe treated as Rw; the Bateman-Konen
// conversion stays gated on a page-referenced source, audit B5).

import React, { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { rwArps, spK, rweFromSsp } from '../engine/rw';
import { cToF } from '../engine/temperature';

const inputCls = 'w-24 rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const num = (v) => Number(v);
const fmt = (v, d = 6) => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : '—');

export default function RwToolsDialog({ open, onOpenChange, onApplyParams, onStatus }) {
  const [sp, setSp] = useState({ ssp: '-100', rmf: '0.5', tempC: '65' });
  const [arps, setArps] = useState({ rw1: '0.1', t1C: '25', t2C: '65' });

  const spOut = useMemo(() => {
    const ssp = num(sp.ssp);
    const rmf = num(sp.rmf);
    const tC = num(sp.tempC);
    if (![ssp, rmf, tC].every(Number.isFinite) || rmf <= 0) return null;
    const tF = cToF(tC);
    return { k: spK(tF), rwe: rweFromSsp(ssp, rmf, tF), tC };
  }, [sp]);

  const arpsOut = useMemo(() => {
    const rw1 = num(arps.rw1);
    const t1 = num(arps.t1C);
    const t2 = num(arps.t2C);
    if (![rw1, t1, t2].every(Number.isFinite) || rw1 <= 0) return null;
    return { rw2: rwArps(rw1, cToF(t1), cToF(t2)), t2 };
  }, [arps]);

  const applyRw = (rw, tC, label) => {
    onApplyParams({ rw: Number(rw.toFixed(6)), rwRefTempC: tC });
    onStatus(`Applied Rw = ${fmt(rw)} at ${tC} °C from the ${label}.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-rwtools-dialog">
        <DialogHeader>
          <DialogTitle>Rw quicklook tools</DialogTitle>
          <DialogDescription className="text-slate-400">
            Temperatures in °C; the SP and Arps formulas run in °F internally.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-xs">
          <div className="rounded border border-slate-800 p-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">SP quicklook</div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1">SSP (mV)
                <input className={inputCls} data-testid="petro-rw-ssp" value={sp.ssp}
                  onChange={(e) => setSp((s) => ({ ...s, ssp: e.target.value }))} />
              </label>
              <label className="flex items-center gap-1">Rmf (ohm·m)
                <input className={inputCls} data-testid="petro-rw-rmf" value={sp.rmf}
                  onChange={(e) => setSp((s) => ({ ...s, rmf: e.target.value }))} />
              </label>
              <label className="flex items-center gap-1">Formation T (°C)
                <input className={inputCls} data-testid="petro-rw-tempc" value={sp.tempC}
                  onChange={(e) => setSp((s) => ({ ...s, tempC: e.target.value }))} />
              </label>
            </div>
            {spOut && (
              <div className="flex items-center gap-3">
                <span className="text-slate-400">K = {fmt(spOut.k, 2)}</span>
                <span className="text-slate-200" data-testid="petro-rw-sp-result">Rwe = {fmt(spOut.rwe)}</span>
                <button type="button" data-testid="petro-rw-sp-apply"
                  className="ml-auto px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => applyRw(spOut.rwe, spOut.tC, 'SP quicklook')}
                >
                  Apply as Rw
                </button>
              </div>
            )}
            <p className="text-[10px] text-slate-500 leading-snug">
              Quicklook chain: Rmfe is taken as Rmf and Rw as Rwe (valid for moderately
              saline, mostly NaCl waters). The full Bateman-Konen conversion waits on a
              page-referenced source, per the validation rule.
            </p>
          </div>

          <div className="rounded border border-slate-800 p-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Arps temperature converter</div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1">Rw
                <input className={inputCls} data-testid="petro-rw-arps-rw" value={arps.rw1}
                  onChange={(e) => setArps((s) => ({ ...s, rw1: e.target.value }))} />
              </label>
              <label className="flex items-center gap-1">at T (°C)
                <input className={inputCls} data-testid="petro-rw-arps-t1" value={arps.t1C}
                  onChange={(e) => setArps((s) => ({ ...s, t1C: e.target.value }))} />
              </label>
              <label className="flex items-center gap-1">to T (°C)
                <input className={inputCls} data-testid="petro-rw-arps-t2" value={arps.t2C}
                  onChange={(e) => setArps((s) => ({ ...s, t2C: e.target.value }))} />
              </label>
            </div>
            {arpsOut && (
              <div className="flex items-center gap-3">
                <span className="text-slate-200" data-testid="petro-rw-arps-result">Rw = {fmt(arpsOut.rw2)}</span>
                <button type="button" data-testid="petro-rw-arps-apply"
                  className="ml-auto px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => applyRw(arpsOut.rw2, arpsOut.t2, 'Arps conversion')}
                >
                  Apply as Rw
                </button>
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-500">
            A third route: fit the water line on the Pickett plot (Crossplots view) and
            apply m and Rw from the fit.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
