/**
 * Lab tuning card (ET3). The tuning workstation for the compositional
 * fluid: enter measured lab values, run the bounded regression in the
 * shared worker, review the before and after match, and apply or reset
 * the tuned plus-fraction knobs. Applied tuning rides
 * composition.tuning.applied, so every compositional card and the saved
 * project pick it up automatically.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, SlidersHorizontal, RotateCcw, AlertTriangle } from 'lucide-react';
import FluidStudioTierBadge from '@/components/fluidstudio/FluidStudioTierBadge';
import { createEnvelopeClient } from '@/utils/fluidstudio/envelopeClient';
import { labTuneRequest } from '@/utils/fluidstudio/eosAnalysis';
import { untunedKnobs } from '@/utils/fluidstudio/eos/labTune';

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

const TARGET_LABELS = {
  psat: 'Saturation pressure',
  totalGor: 'Total GOR',
  stoApi: 'Stock-tank API',
  bo: 'Bo at reservoir P/T',
};

const Field = ({ id, label, unit, value, onChange, placeholder }) => (
  <div>
    <Label htmlFor={id} className="text-xs text-slate-400">{label}</Label>
    <div className="flex items-center mt-1">
      <Input
        id={id}
        type="number"
        step="any"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        placeholder={placeholder}
        className="bg-slate-800 border-slate-600 text-white h-8 text-sm"
      />
      {unit && <span className="ml-2 text-xs text-slate-400 whitespace-nowrap">{unit}</span>}
    </div>
  </div>
);

const LabTuningCard = ({ composition, stages, onUpdateTuning }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastFit, setLastFit] = useState(null);
  const clientRef = useRef(null);
  useEffect(() => () => clientRef.current?.dispose(), []);

  const lab = composition?.tuning?.lab ?? {};
  const applied = composition?.tuning?.applied ?? null;
  const setLab = (field, value) => onUpdateTuning({ lab: { ...lab, [field]: value } });

  const start = useMemo(() => {
    const mw = Number(composition?.plus?.mw);
    const sg = Number(composition?.plus?.sg);
    return mw > 0 && sg > 0 ? untunedKnobs({ mw, sg }) : null;
  }, [composition?.plus?.mw, composition?.plus?.sg]);

  const runTune = async () => {
    setError(null);
    const { request, reasons } = labTuneRequest(composition, stages);
    if (!request) {
      setError(reasons.join(' '));
      return;
    }
    if (!clientRef.current) clientRef.current = createEnvelopeClient();
    setBusy(true);
    try {
      const fit = await clientRef.current.tune(request);
      if (!fit.ok) {
        setError(fit.reason || 'The regression could not run.');
      } else {
        setLastFit(fit);
        onUpdateTuning({ applied: fit.tuning });
      }
    } catch (err) {
      setError(err?.message || 'The regression failed.');
    } finally {
      setBusy(false);
    }
  };

  const resetTune = () => {
    setLastFit(null);
    setError(null);
    onUpdateTuning({ applied: null });
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700 text-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center text-base">
            <SlidersHorizontal className="w-4 h-4 mr-2 text-cyan-300" />
            Lab tuning
          </CardTitle>
          {applied
            ? <FluidStudioTierBadge tier="lab_tuned" />
            : (
              <FluidStudioTierBadge
                tier="screening"
                note="The plus fraction currently uses untuned generalized correlations. Enter measured lab values and tune to match your PVT report."
              />
            )}
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Regresses the C7+ fraction (Tc, Pc, methane interaction and volume shift, all bounded)
          to your measured values. Separator measurements are read against the Separator Train
          stages with the flash temperature and pressure as reservoir conditions.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field id="lt-psat" label="Measured Psat" unit="psia" value={lab.psatPsia} onChange={(v) => setLab('psatPsia', v)} />
          <Field id="lt-psat-t" label="Psat temperature" unit="°F" value={lab.psatTF} onChange={(v) => setLab('psatTF', v)} placeholder={composition?.temp != null ? String(composition.temp) : ''} />
          <Field id="lt-gor" label="Total GOR" unit="scf/STB" value={lab.totalGor} onChange={(v) => setLab('totalGor', v)} />
          <Field id="lt-api" label="Stock-tank API" unit="°API" value={lab.stoApi} onChange={(v) => setLab('stoApi', v)} />
          <Field id="lt-bo" label="Bo at res P/T" unit="rb/STB" value={lab.bo} onChange={(v) => setLab('bo', v)} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={runTune} disabled={busy} className="bg-cyan-700 hover:bg-cyan-600">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <SlidersHorizontal className="w-4 h-4 mr-2" />}
            {busy ? 'Tuning...' : 'Tune to lab data'}
          </Button>
          {applied && (
            <Button size="sm" variant="outline" onClick={resetTune} className="border-slate-600 text-slate-300">
              <RotateCcw className="w-4 h-4 mr-2" />Reset to untuned
            </Button>
          )}
          {error && (
            <span className="text-xs text-amber-300 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />{error}
            </span>
          )}
        </div>

        {lastFit && (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs border-b border-slate-700">
                    <th className="text-left py-1 pr-2">Target</th>
                    <th className="text-right py-1 px-2">Measured</th>
                    <th className="text-right py-1 px-2">Untuned</th>
                    <th className="text-right py-1 px-2">Tuned</th>
                    <th className="text-right py-1 pl-2">Error after tune</th>
                  </tr>
                </thead>
                <tbody>
                  {lastFit.report.map((r) => (
                    <tr key={r.name} className="border-b border-slate-700/50">
                      <td className="py-1 pr-2 text-slate-300">{TARGET_LABELS[r.name] || r.name} <span className="text-slate-500">({r.unit})</span></td>
                      <td className="text-right py-1 px-2">{fmt(r.measured, r.name === 'bo' ? 3 : 1)}</td>
                      <td className="text-right py-1 px-2 text-slate-400">{fmt(r.untuned, r.name === 'bo' ? 3 : 1)}</td>
                      <td className="text-right py-1 px-2 text-cyan-200">{fmt(r.tuned, r.name === 'bo' ? 3 : 1)}</td>
                      <td className="text-right py-1 pl-2 text-cyan-200">
                        {r.name === 'stoApi' ? `${fmt(r.tunedErr, 2)} API` : `${fmt(r.tunedErr, 2)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!lastFit.converged && (
              <p className="text-xs text-amber-300 flex items-start gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                The regression stopped at its iteration limit. The values above are the best point found; rerun after adjusting weights or checking the measured values.
              </p>
            )}
            {lastFit.boundsHit?.length > 0 && (
              <p className="text-xs text-amber-300 flex items-start gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Parameter{lastFit.boundsHit.length > 1 ? 's' : ''} {lastFit.boundsHit.join(', ')} stopped at the regression bound. The lab values may be inconsistent with this composition; double-check the entered measurements.
              </p>
            )}
          </div>
        )}

        {applied && (
          <div className="text-xs text-slate-400">
            Applied knobs: Tc ×{fmt(applied.fTc, 4)}, Pc ×{fmt(applied.fPc, 4)},
            k(C1-C7+) {fmt(applied.kC1, 4)}{start ? ` (untuned ${fmt(start.kC1, 4)})` : ''},
            shift {fmt(applied.sPlus, 4)}{start ? ` (untuned ${fmt(start.sPlus, 4)})` : ''}.
            All compositional results, the envelope and the handoffs use the tuned fluid.
            {!lastFit && ' Run "Tune to lab data" again to regenerate the before and after table.'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LabTuningCard;
