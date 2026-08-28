// Plunger Lift tab.
//
// Feasibility rests on the COMPUTED gas-liquid ratio: the gas one cycle
// needs, from the real gas law over the swept tubing volume, divided by
// the liquid that cycle brings up. The industry's screening rule of
// thumb is reported beside it as a labelled cross-check, and whether
// the two agree is surfaced, because a well sitting between them is
// exactly where a heuristic misleads.
import React from 'react';
import { ArrowUpCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGasWell } from '@/contexts/GasWellPerformanceContext';
import { Field, NumberInput, fmt, Stat, Row } from './fields';

const PlungerPanel = () => {
  const { plunger, model } = useGasWell();

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-sky-400" /> Would a plunger lift this well
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Casing pressure (psia)" hint="built during shut-in">
              <NumberInput section="plunger" name="casingPressurePsia" />
            </Field>
            <Field label="Line pressure (psia)"><NumberInput section="plunger" name="linePressurePsia" /></Field>
            <Field label="Slug length (ft)"><NumberInput section="plunger" name="slugLengthFt" /></Field>
            <Field label="Liquid gravity"><NumberInput section="plunger" name="liquidSg" step="0.01" /></Field>
            <Field label="Plunger weight (lb)"><NumberInput section="plunger" name="plungerWeightLb" step="0.1" /></Field>
            <Field label="Well GLR (scf/bbl)"><NumberInput section="plunger" name="wellGlrScfBbl" /></Field>
            <Field label="Friction (psi)" hint="measured, not modelled">
              <NumberInput section="plunger" name="frictionPsi" />
            </Field>
            <Field label="Rise velocity (ft/min)" hint="700 to 1000 is the usual target">
              <NumberInput section="plunger" name="riseFtMin" />
            </Field>
            <Field label="Fall in gas (ft/min)"><NumberInput section="plunger" name="fallInGasFtMin" /></Field>
            <Field label="Fall in liquid (ft/min)"><NumberInput section="plunger" name="fallInLiquidFtMin" /></Field>
            <Field label="Afterflow (min)"><NumberInput section="plunger" name="afterflowMin" /></Field>
            <Field label="Shut-in (min)"><NumberInput section="plunger" name="shutInMin" /></Field>
          </div>

          {!plunger ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              The analysis has to run first: the plunger screening uses this well's depth, tubing
              and column temperatures.
            </p>
          ) : !plunger.ok ? (
            <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3">
              <ul className="text-[11px] text-amber-200/80 space-y-1 list-disc pl-4">
                {plunger.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          ) : (
            <>
              <div className={`rounded-md border p-3 ${plunger.design.feasible
                ? 'border-emerald-900/60 bg-emerald-950/20'
                : 'border-amber-900/60 bg-amber-950/20'}`}
              >
                <p className={`text-sm font-semibold flex items-center gap-2 ${plunger.design.feasible ? 'text-emerald-400' : 'text-amber-300'}`}>
                  {plunger.design.feasible
                    ? <CheckCircle2 className="w-4 h-4" />
                    : <AlertTriangle className="w-4 h-4" />}
                  {plunger.design.feasible
                    ? `This well has the pressure and the gas to run a plunger: about ${fmt(plunger.design.timing.cyclesPerDay, 1)} trips a day, lifting ${fmt(plunger.design.liquidPerDayBbl, 1)} bbl.`
                    : 'This well will not plunger lift as it stands.'}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-800 pt-4">
                <Stat
                  label="Pressure needed"
                  value={fmt(plunger.design.lift.requiredPsia)}
                  unit="psia"
                  accent={plunger.design.pressureOk ? 'text-emerald-400' : 'text-red-400'}
                  hint="to move the plunger and its slug"
                />
                <Stat
                  label="Gas a cycle needs"
                  value={fmt(plunger.design.gasPerCycleScf)}
                  unit="scf"
                />
                <Stat
                  label="Liquid a cycle lifts"
                  value={fmt(plunger.design.liquidPerCycleBbl, 2)}
                  unit="bbl"
                />
                <Stat
                  label="Longest slug"
                  value={fmt(plunger.maxSlugFt)}
                  unit="ft"
                  hint="that this casing pressure could lift"
                />
              </div>

              <div className="border-t border-slate-800 pt-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
                  The gas-liquid ratio test
                </p>
                <Row
                  label="Required, computed"
                  value={`${fmt(plunger.design.requiredGlrScfBbl)} scf/bbl`}
                  hint="the gas one cycle needs over the liquid it brings up. This is the verdict."
                />
                <Row
                  label="This well makes"
                  value={`${fmt(plunger.design.wellGlrScfBbl)} scf/bbl`}
                />
                <Row
                  label="Screening rule of thumb"
                  value={`${fmt(plunger.design.ruleOfThumbGlrScfBbl)} scf/bbl`}
                  hint="400 scf per barrel per 1,000 ft. Reported for comparison; not used to decide."
                />
                {plunger.design.ruleOfThumbAgrees === false && (
                  <p className="text-[11px] text-amber-300 pt-2">
                    The rule of thumb and the physics disagree on this well. A well sitting between
                    the two numbers is exactly where a screening heuristic misleads, which is why
                    both are shown.
                  </p>
                )}
              </div>

              <div className="border-t border-slate-800 pt-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
                  The lift balance, term by term
                </p>
                <Row label="Line pressure" value={`${fmt(plunger.design.lift.terms.linePressurePsia)} psi`} />
                <Row label="Slug hydrostatic" value={`${fmt(plunger.design.lift.terms.slugPsi)} psi`} />
                <Row label="Plunger weight" value={`${fmt(plunger.design.lift.terms.plungerPsi, 1)} psi`} hint={`over ${fmt(plunger.design.lift.areaIn2, 2)} in2 of tubing`} />
                <Row label="Gas column above" value={`${fmt(plunger.design.lift.terms.gasColumnPsi, 1)} psi`} />
                <Row label="Friction" value={`${fmt(plunger.design.lift.terms.frictionPsi)} psi`} />
              </div>

              <div className="border-t border-slate-800 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Rise" value={fmt(plunger.design.timing.riseMin, 1)} unit="min" hint={`over ${fmt(model.tvdMax)} ft`} />
                <Stat label="Fall" value={fmt(plunger.design.timing.fallMin, 1)} unit="min" />
                <Stat label="Cycle" value={fmt(plunger.design.timing.totalMin, 1)} unit="min" />
                <Stat label="Trips a day" value={fmt(plunger.design.timing.cyclesPerDay, 1)} />
              </div>

              {plunger.design.warnings.length > 0 && (
                <ul className="space-y-2 border-t border-slate-800 pt-4">
                  {plunger.design.warnings.map((w) => (
                    <li key={w.code} className="text-sm text-amber-100/80 flex gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                      <span>{w.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PlungerPanel;
