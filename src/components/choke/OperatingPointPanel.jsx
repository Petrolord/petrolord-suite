// Operating Point tab: what this bean does on this well, right now.
import React from 'react';
import { Gauge, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChoke } from '@/contexts/ChokePerformanceContext';
import { fmt, Stat, Row } from './fields';

const OperatingPointPanel = () => {
  const { result, model } = useChoke();
  if (!result) return null;
  const { solved, erosion, hydrate } = result;
  const isGas = result.phase === 'gas';
  const rateUnit = isGas ? 'Mscf/d' : 'stb/d';

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <span className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-sky-400" /> A {result.s64}/64 bean on this well
            </span>
            <span className="block text-xs font-normal text-slate-500 mt-0.5">
              The choke sets the wellhead pressure, the tubing carries it down, and the inflow
              closes it. The bean is a constraint in the nodal solve rather than a number applied
              afterwards.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className={`rounded-md border p-3 ${solved.critical
            ? 'border-emerald-900/60 bg-emerald-950/20'
            : 'border-amber-900/60 bg-amber-950/20'}`}
          >
            <p className={`text-sm font-semibold flex items-center gap-2 ${solved.critical ? 'text-emerald-400' : 'text-amber-300'}`}>
              {solved.critical ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {solved.critical
                ? `Critical flow: the bean is setting the rate at ${fmt(solved.q)} ${rateUnit}.`
                : `${isGas ? 'Subsonic' : 'Subcritical'}: the line pressure is setting the rate, not the bean.`}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {isGas
                ? `Downstream is ${fmt(solved.ratio * 100)} percent of upstream, against a critical ratio of ${fmt(solved.yc * 100)} percent from the heat capacity ratio.`
                : `Downstream is ${fmt(solved.ratio * 100)} percent of the wellhead pressure. The Gilbert family holds below 55 percent.`}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              label="Rate"
              value={fmt(solved.q)}
              unit={rateUnit}
              accent="text-emerald-400"
            />
            <Stat
              label="Wellhead pressure"
              value={fmt(solved.pwh)}
              unit="psia"
              hint={`against ${fmt(result.pDownstream)} psia downstream`}
            />
            <Stat
              label="Flowing bottomhole"
              value={fmt(solved.pwf)}
              unit="psia"
              hint={`reservoir ${fmt(model.prPsia)} psia`}
            />
            <Stat
              label="Pressure across the bean"
              value={fmt(solved.pwh - result.pDownstream)}
              unit="psi"
            />
          </div>

          <div className="border-t border-slate-800 pt-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
              How the answer was reached
            </p>
            <Row
              label="Correlation"
              value={isGas
                ? 'Single-phase gas choke'
                : (result.usingFitted ? 'Fitted to this well' : result.correlation.charAt(0).toUpperCase() + result.correlation.slice(1))}
              hint={isGas
                ? 'Sonic and subsonic branches, with the critical ratio from the heat capacity ratio'
                : (result.usingFitted
                  ? 'Coefficients fitted to the well\'s own tests rather than a published set'
                  : 'A published coefficient set. Fitting to this well\'s tests is better if there are any.')}
            />
            {isGas && <Row label="Flow regime" value={solved.regime} />}
            {isGas && Number.isFinite(solved.tDownstreamF) && (
              <Row
                label="Gas leaves the bean at"
                value={`${fmt(solved.tDownstreamF)} F`}
                hint="Joule-Thomson cooling, from the isentropic expansion"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {erosion?.ok && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              The flowline
              <span className="block text-xs font-normal text-slate-500 mt-0.5">
                API RP 14E erosional velocity at C = {result.cFactor}. The fluid is taken at
                wellhead conditions, because a gassy stream at 200 psia is a different fluid from
                the same stream at 2,000.
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat
                label="Mixture velocity"
                value={fmt(erosion.velocityFtS, 1)}
                unit="ft/s"
                accent={erosion.exceeded ? 'text-red-400' : 'text-emerald-400'}
              />
              <Stat label="Erosional limit" value={fmt(erosion.erosionalFtS, 1)} unit="ft/s" />
              <Stat
                label="Margin"
                value={fmt(erosion.marginPct)}
                unit="%"
                accent={erosion.exceeded ? 'text-red-400' : 'text-emerald-400'}
              />
              <Stat
                label="Mixture density"
                value={fmt(erosion.mixtureDensityLbFt3, 1)}
                unit="lb/ft3"
                hint={`${fmt(erosion.inSituBpd)} bbl/d in situ`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {hydrate?.ok && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Hydrate screening
              <span className="block text-xs font-normal text-slate-500 mt-0.5">
                A screening only. The Hammerschmidt form takes no account of gas composition, which
                hydrate formation depends strongly on; a real curve is a flash against a hydrate
                model with the actual composition.
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Downstream of the bean" value={fmt(hydrate.downstreamF)} unit="F" />
              <Stat label="Screening hydrate point" value={fmt(hydrate.formationF)} unit="F" />
              <Stat
                label="Margin"
                value={fmt(hydrate.marginF)}
                unit="F"
                accent={hydrate.atRisk ? 'text-red-400' : 'text-emerald-400'}
                hint={hydrate.atRisk ? 'below the screening line' : 'above the screening line'}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OperatingPointPanel;
