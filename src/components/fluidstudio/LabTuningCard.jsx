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
import UnitField from '@/components/fluidstudio/UnitField';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { Loader2, SlidersHorizontal, RotateCcw, AlertTriangle } from 'lucide-react';
import FluidStudioTierBadge, { TuneStatusBadge } from '@/components/fluidstudio/FluidStudioTierBadge';
import { createEnvelopeClient } from '@/utils/fluidstudio/envelopeClient';
import { labTuneRequest, tuningStatus, tuneRecord } from '@/utils/fluidstudio/eosAnalysis';
import { untunedKnobs } from '@/utils/fluidstudio/eos/labTune';

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : EMPTY_VALUE);
// the kind of each tuning target, for display units
const TARGET_KIND = { psat: 'pressure', totalGor: 'gor', stoApi: 'api', bo: 'fvfOil' };

const TARGET_LABELS = {
  psat: 'Saturation pressure',
  totalGor: 'Total GOR',
  stoApi: 'Stock-tank API',
  bo: 'Bo at reservoir P/T',
};

// measured values convert at the door (FLUID-U1, PL3): stored in oilfield units
const Field = ({ id, label, kind, value, onChange, placeholder }) => (
  <UnitField
    id={id} label={label} kind={kind} value={value == null || value === '' ? null : Number(value)} placeholder={placeholder}
    onChange={onChange} labelClassName="text-xs text-pl-muted" inputClassName="h-8 text-sm" unitClassName="ml-2 text-xs text-pl-muted"
  />
);

const LabTuningCard = ({ composition, stages, onUpdateTuning }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastFit, setLastFit] = useState(null);
  const clientRef = useRef(null);
  useEffect(() => () => clientRef.current?.dispose(), []);

  const u = useFluidUnits();
  const lab = composition?.tuning?.lab ?? {};
  const applied = composition?.tuning?.applied ?? null;
  // H10: does the applied tune still belong to this fluid?
  const status = tuningStatus(composition, stages);
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
        // H10: keep what the fit consumed beside the knobs, so a later edit
        // of the fluid, the lab values or the separator train is noticed.
        // FLUID-U1: and the record of the match itself, for the report.
        onUpdateTuning({ applied: fit.tuning, fittedOn: JSON.stringify(request), fit: tuneRecord(fit, composition) });
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
    onUpdateTuning({ applied: null, fittedOn: null, fit: null });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center text-base">
            <SlidersHorizontal className="w-4 h-4 mr-2 text-pl-muted" />
            Lab tuning
          </CardTitle>
          {applied
            ? <TuneStatusBadge status={status} />
            : (
              <FluidStudioTierBadge
                tier="screening"
                note="The plus fraction currently uses untuned generalized correlations. Enter measured lab values and tune to match your PVT report."
              />
            )}
        </div>
        <p className="text-xs text-pl-muted mt-1">
          Regresses the C7+ fraction (Tc, Pc, methane interaction and volume shift, all bounded)
          to your measured values. Separator measurements are read against the Separator Train
          stages with the flash temperature and pressure as reservoir conditions.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field id="lt-psat" label="Measured Psat" kind="pressure" value={lab.psatPsia} onChange={(v) => setLab('psatPsia', v)} />
          <Field id="lt-psat-t" label="Psat temperature" kind="temperature" value={lab.psatTF} onChange={(v) => setLab('psatTF', v)} placeholder={composition?.temp != null ? u.text('temperature', composition.temp) : ''} />
          <Field id="lt-gor" label="Total GOR" kind="gor" value={lab.totalGor} onChange={(v) => setLab('totalGor', v)} />
          <Field id="lt-api" label="Stock-tank API" kind="api" value={lab.stoApi} onChange={(v) => setLab('stoApi', v)} />
          <Field id="lt-bo" label="Bo at res P/T" kind="fvfOil" value={lab.bo} onChange={(v) => setLab('bo', v)} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={runTune} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <SlidersHorizontal className="w-4 h-4 mr-2" />}
            {busy ? 'Tuning...' : 'Tune to lab data'}
          </Button>
          {applied && (
            <Button size="sm" variant="outline" onClick={resetTune}>
              <RotateCcw className="w-4 h-4 mr-2" />Reset to untuned
            </Button>
          )}
          {error && (
            <span className="text-xs text-pl-warning-text flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />{error}
            </span>
          )}
        </div>

        {lastFit && (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-pl-muted text-xs border-b border-pl-border">
                    <th className="text-left py-1 pr-2">Target</th>
                    <th className="text-right py-1 px-2">Measured</th>
                    <th className="text-right py-1 px-2">Untuned</th>
                    <th className="text-right py-1 px-2">Tuned</th>
                    <th className="text-right py-1 pl-2">Error after tune</th>
                  </tr>
                </thead>
                <tbody>
                  {lastFit.report.map((r) => (
                    <tr key={r.name} className="border-b border-pl-border">
                      <td className="py-1 pr-2 text-pl-text">{TARGET_LABELS[r.name] || r.name} <span className="text-pl-muted">({u.label(TARGET_KIND[r.name]) || r.unit})</span></td>
                      <td className="text-right py-1 px-2">{fmt(u.show(TARGET_KIND[r.name], r.measured), r.name === 'bo' ? 3 : 1)}</td>
                      <td className="text-right py-1 px-2 text-pl-muted">{fmt(u.show(TARGET_KIND[r.name], r.untuned), r.name === 'bo' ? 3 : 1)}</td>
                      <td className="text-right py-1 px-2 font-semibold text-pl-text">{fmt(u.show(TARGET_KIND[r.name], r.tuned), r.name === 'bo' ? 3 : 1)}</td>
                      <td className="text-right py-1 pl-2 font-semibold text-pl-text">
                        {r.name === 'stoApi' ? `${fmt(r.tunedErr, 2)} API` : `${fmt(r.tunedErr, 2)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!lastFit.converged && (
              <p className="text-xs text-pl-warning-text flex items-start gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                The regression stopped at its iteration limit. The values above are the best point found; rerun after adjusting weights or checking the measured values.
              </p>
            )}
            {lastFit.boundsHit?.length > 0 && (
              <p className="text-xs text-pl-warning-text flex items-start gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Parameter{lastFit.boundsHit.length > 1 ? 's' : ''} {lastFit.boundsHit.join(', ')} stopped at the regression bound. The lab values may be inconsistent with this composition; double-check the entered measurements.
              </p>
            )}
          </div>
        )}

        {applied && status !== 'current' && (
          <p className="text-xs text-pl-warning-text flex items-start gap-1" data-testid="lab-tuning-stale">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {status === 'stale'
                ? 'The composition, the C7+ description, the lab values, the flash conditions or the separator train changed after the fluid was tuned.'
                : 'This fluid was tuned before the app kept a record of what it was tuned on, so the match cannot be confirmed.'}
              {' '}The tuned C7+ properties are still applied, so the results may no longer reproduce the lab values. Run Tune to lab data again, or reset to untuned.
            </span>
          </p>
        )}

        {applied && (
          <div className="text-xs text-pl-muted">
            Applied knobs: Tc ×{fmt(applied.fTc, 4)}, Pc ×{fmt(applied.fPc, 4)},
            k(C1-C7+) {fmt(applied.kC1, 4)}{start ? ` (untuned ${fmt(start.kC1, 4)})` : ''},
            shift {fmt(applied.sPlus, 4)}{start ? ` (untuned ${fmt(start.sPlus, 4)})` : ''}.
            All compositional results, the envelope and the handoffs use these C7+ properties.
            {!lastFit && ' Run "Tune to lab data" again to regenerate the before and after table.'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LabTuningCard;
