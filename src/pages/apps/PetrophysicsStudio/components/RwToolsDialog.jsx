// Rw tools (Petrophysics Studio PS5, PT9d, PT11a): the SP route, the
// Arps temperature converter and Rw from salinity, wiring the engine
// functions validated in the engines repo. Inputs are degC; the SP and
// Arps formulas are defined in degF so the module converts at this
// boundary and the copy says so. PT11a: the SP route is the full chain
// (Rmf -> Rmfe -> Rwe -> Rw by Bateman & Konen 1977, audit B5 closed);
// every intermediate value is shown, Rw is what gets applied, and a
// value outside the fit's limits is refused with the reason rather
// than extrapolated. Each apply names its method in params.rwMethod and
// records a provenance entry through onProvenance.

import React, { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { rwArps, rwFromSsp, rweToRwProblem, rwToRweProblem, rweBand, rwFromSalinity, salinityFromRw } from '../engine/rw';
import { RW_METHOD_LABELS } from '../services/paramFields';
import { cToF } from '../engine/temperature';

const inputCls = 'w-24 rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const num = (v) => Number(v);
const fmt = (v, d = 6) => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : '—');

export default function RwToolsDialog({
  open, onOpenChange, onApplyParams, onStatus, onProvenance = null, currentRw = null, currentRwTempC = null,
  surfaceTempC = 25,
}) {
  // PT11a: Rmf carries the temperature it was measured at (default the
  // surface temperature parameter); formation T is where the chain runs
  const [sp, setSp] = useState({ ssp: '-100', rmf: '0.5', rmfTempC: String(surfaceTempC), tempC: '65' });
  const [arps, setArps] = useState({ rw1: '0.1', t1C: '25', t2C: '65' });
  // PT9d: salinity route (Bateman-Konen fit to the Gen-9 chart)
  const [sal, setSal] = useState({ ppm: '30000', tempC: '65' });

  const salOut = useMemo(() => {
    const ppm = num(sal.ppm);
    const tC = num(sal.tempC);
    if (!(ppm > 0) || !Number.isFinite(tC)) return null;
    return { rw: rwFromSalinity(ppm, cToF(tC)), tC, ppm };
  }, [sal]);

  // what the CURRENT Rw parameter implies, so the user sees where their
  // number sits on the salinity scale
  const impliedPpm = useMemo(() => {
    if (!(currentRw > 0) || !Number.isFinite(currentRwTempC)) return NaN;
    return salinityFromRw(currentRw, cToF(currentRwTempC));
  }, [currentRw, currentRwTempC]);

  const spOut = useMemo(() => {
    const ssp = num(sp.ssp);
    const rmf = num(sp.rmf);
    const rmfTC = num(sp.rmfTempC);
    const tC = num(sp.tempC);
    if (![ssp, rmf, rmfTC, tC].every(Number.isFinite) || rmf <= 0) return null;
    const tF = cToF(tC);
    const chain = rwFromSsp(ssp, rmf, cToF(rmfTC), tF);
    // why the chain refused, if it did: the filtrate inverse can land
    // outside the accepted band before the Rwe step does
    let problem = null;
    if (!Number.isFinite(chain.rmfe)) problem = rwToRweProblem(chain.rmfAtT, tF) || 'The chart inverse gives no Rmfe for this mud filtrate.';
    else if (!Number.isFinite(chain.rw)) problem = rweToRwProblem(chain.rwe, tF);
    const band = rweBand(tF);
    return { ...chain, tC, rmfTC, problem, band };
  }, [sp]);

  const arpsOut = useMemo(() => {
    const rw1 = num(arps.rw1);
    const t1 = num(arps.t1C);
    const t2 = num(arps.t2C);
    if (![rw1, t1, t2].every(Number.isFinite) || rw1 <= 0) return null;
    return { rw2: rwArps(rw1, cToF(t1), cToF(t2)), t2 };
  }, [arps]);

  // PT11a: every apply names its method (params.rwMethod, shown in the
  // parameter panel and the report) and records who applied what
  const applyRw = (rw, tC, label, method, detail = {}) => {
    onApplyParams({ rw: Number(rw.toFixed(6)), rwRefTempC: tC, rwMethod: method });
    if (onProvenance) {
      onProvenance({
        kind: 'rw-apply',
        method,
        rw: Number(rw.toFixed(6)),
        tempC: tC,
        ...detail,
        note: `Rw = ${fmt(rw)} ohm·m at ${tC} °C applied from the ${label} (${RW_METHOD_LABELS[method]}).`,
      });
    }
    onStatus(`Applied Rw = ${fmt(rw)} at ${tC} °C from the ${label}.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-rwtools-dialog">
        <DialogHeader>
          <DialogTitle>Rw tools</DialogTitle>
          <DialogDescription className="text-slate-400">
            Temperatures in °C; the SP and Arps formulas run in °F internally.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-xs">
          <div className="rounded border border-slate-800 p-2 space-y-1.5" data-testid="petro-rw-sp-card">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">SP route (Bateman-Konen)</div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1">SSP (mV)
                <input className={inputCls} data-testid="petro-rw-ssp" value={sp.ssp}
                  onChange={(e) => setSp((s) => ({ ...s, ssp: e.target.value }))} />
              </label>
              <label className="flex items-center gap-1">Rmf (ohm·m)
                <input className={inputCls} data-testid="petro-rw-rmf" value={sp.rmf}
                  onChange={(e) => setSp((s) => ({ ...s, rmf: e.target.value }))} />
              </label>
              <label className="flex items-center gap-1">measured at (°C)
                <input className={inputCls} data-testid="petro-rw-rmf-tempc" value={sp.rmfTempC}
                  onChange={(e) => setSp((s) => ({ ...s, rmfTempC: e.target.value }))} />
              </label>
              <label className="flex items-center gap-1">Formation T (°C)
                <input className={inputCls} data-testid="petro-rw-tempc" value={sp.tempC}
                  onChange={(e) => setSp((s) => ({ ...s, tempC: e.target.value }))} />
              </label>
            </div>
            {spOut && (
              <div className="space-y-1" data-testid="petro-rw-sp-chain">
                <div className="flex items-center gap-3 flex-wrap text-slate-400">
                  <span>K = {fmt(spOut.k, 2)}</span>
                  <span>Rmf at FT = {fmt(spOut.rmfAtT)}</span>
                  <span data-testid="petro-rw-sp-rmfe">
                    Rmfe = {fmt(spOut.rmfe)}
                    {spOut.rmfeRule && (
                      <span className="text-slate-500"> ({spOut.rmfeRule === 'x0.85' ? 'by 0.85 Rmf' : 'by the Bateman-Konen inverse'})</span>
                    )}
                  </span>
                  <span data-testid="petro-rw-sp-result">Rwe = {fmt(spOut.rwe)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-200" data-testid="petro-rw-sp-rw">
                    Rw = {fmt(spOut.rw)}
                    <span className="text-slate-500"> (Rw from Rwe by Bateman-Konen 1977)</span>
                  </span>
                  <button type="button" data-testid="petro-rw-sp-apply"
                    disabled={!Number.isFinite(spOut.rw)}
                    className="ml-auto px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => applyRw(spOut.rw, spOut.tC, 'SP route', 'sp-bateman-konen', {
                      inputs: { ssp: num(sp.ssp), rmf: num(sp.rmf), rmfTempC: spOut.rmfTC, tempC: spOut.tC },
                      rmfe: spOut.rmfe, rmfeRule: spOut.rmfeRule, rwe: spOut.rwe,
                    })}
                  >
                    Apply as Rw
                  </button>
                </div>
                {spOut.problem && (
                  <p className="text-[10px] text-amber-300/90" data-testid="petro-rw-sp-problem">
                    Refused: {spOut.problem} Nothing is applied.
                  </p>
                )}
              </div>
            )}
            <p className="text-[10px] text-slate-500 leading-snug">
              Rmf goes to formation temperature by Arps, then to Rmfe (0.85 Rmf when Rmf at 75 °F is above
              0.1 ohm·m, otherwise the chart inverse); Rwe comes from SSP and K; Rw from Rwe by the Bateman
              and Konen (1977) fit to chart SP-2. The fit is applied only where chart SP-2 allows it: 75 to
              500 °F and Rwe between {spOut?.band ? spOut.band.lo.toPrecision(2) : '0.02'} and 0.1 ohm·m at
              formation temperature (readings off the chart on 2026-09-10 put the fit 36 to 92 percent low
              for fresher waters and 13 to 24 percent high near NaCl saturation). Inside the band the fit
              follows the chart to within about 10 percent (75 °F readings: +9 percent at Rwe 0.02, within
              4 percent above 0.04); outside it the Studio refuses. NaCl waters only.
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
                  onClick={() => applyRw(arpsOut.rw2, arpsOut.t2, 'Arps conversion', 'arps', { inputs: { rw1: num(arps.rw1), t1C: num(arps.t1C) } })}
                >
                  Apply as Rw
                </button>
              </div>
            )}
          </div>

          <div className="rounded border border-slate-800 p-2 space-y-1.5" data-testid="petro-rw-salinity-card">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Rw from salinity</div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1">NaCl (ppm)
                <input className={inputCls} data-testid="petro-rw-sal-ppm" value={sal.ppm}
                  onChange={(e) => setSal((s) => ({ ...s, ppm: e.target.value }))} />
              </label>
              <label className="flex items-center gap-1">Formation T (°C)
                <input className={inputCls} data-testid="petro-rw-sal-tempc" value={sal.tempC}
                  onChange={(e) => setSal((s) => ({ ...s, tempC: e.target.value }))} />
              </label>
            </div>
            {salOut && Number.isFinite(salOut.rw) && (
              <div className="flex items-center gap-3">
                <span className="text-slate-200" data-testid="petro-rw-sal-result">Rw = {fmt(salOut.rw)} at {salOut.tC} °C</span>
                <button type="button" data-testid="petro-rw-sal-apply"
                  className="ml-auto px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => applyRw(salOut.rw, salOut.tC, `salinity of ${salOut.ppm} ppm NaCl`, 'salinity', { inputs: { ppm: salOut.ppm } })}
                >
                  Apply as Rw
                </button>
              </div>
            )}
            {Number.isFinite(impliedPpm) && (
              <p className="text-[10px] text-slate-400" data-testid="petro-rw-sal-implied">
                Your current Rw of {fmt(currentRw)} at {currentRwTempC} °C implies about {Math.round(impliedPpm / 100) * 100} ppm NaCl.
              </p>
            )}
            <p className="text-[10px] text-slate-500 leading-snug">
              Bateman and Konen (1977) fit to the Gen-9 chart, Rw at 75 °F = 0.0123 + 3647.5 / ppm^0.955,
              then Arps to the formation temperature: within about 10 percent of the chart from 1,000 to
              300,000 ppm. For waters that are not NaCl, enter the NaCl-equivalent salinity.
            </p>
          </div>

          <p className="text-[10px] text-slate-500">
            A fourth route: fit the water line on the Pickett plot (Crossplots view) and
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
