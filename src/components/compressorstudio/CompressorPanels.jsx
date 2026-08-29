// Compressor studio panels: duty and machine inputs, the staged train,
// the machine screen, and the discharge-pressure sweep.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useCompressor } from '@/contexts/CompressorStudioContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput, TextInput } from './fields';

export const DutyInputs = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
      <Field label="Gas rate (MMscfd)"><NumberInput section="duty" name="qMMscfd" step="0.1" /></Field>
      <Field label="Gas gravity"><NumberInput section="duty" name="gasSg" step="0.01" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Suction (psig)"><NumberInput section="duty" name="pSuctionPsig" /></Field>
      <Field label="Discharge (psig)"><NumberInput section="duty" name="pDischargePsig" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Suction temp (F)"><NumberInput section="duty" name="tSuctionF" /></Field>
      <Field label="k (Cp/Cv)" hint="Lean gas about 1.28; richer gas lower, which lets a stage take more ratio.">
        <NumberInput section="duty" name="k" step="0.01" />
      </Field>
    </div>

    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Machine</p>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Polytropic efficiency" hint="0.72 to 0.82 typical. This is NOT the isentropic efficiency.">
        <NumberInput section="machine" name="polytropicEfficiency" step="0.01" />
      </Field>
      <Field label="Mechanical efficiency"><NumberInput section="machine" name="mechanicalEfficiency" step="0.01" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Max ratio per stage"><NumberInput section="machine" name="maxRatioPerStage" step="0.1" /></Field>
      <Field label="Max discharge (F)" hint="Usually what really sets the stage count.">
        <NumberInput section="machine" name="maxDischargeF" />
      </Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Intercool to (F)"><NumberInput section="machine" name="interstageCoolToF" /></Field>
      <Field label="Gas Cp (Btu/lb F)"><NumberInput section="machine" name="cpBtuLbF" step="0.01" /></Field>
    </div>

    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Driver</p>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Heat rate (Btu/hp-hr)" hint="Gas engine about 8000; a good turbine lower.">
        <NumberInput section="driver" name="heatRateBtuHpHr" />
      </Field>
      <Field label="Fuel LHV (Btu/scf)"><NumberInput section="driver" name="gasLhvBtuScf" /></Field>
    </div>
    <Field label="Discharge pressures to sweep (psig)" hint="Comma separated.">
      <TextInput section="sweep" name="dischargePressures" />
    </Field>
  </div>
);

export const TrainResults = () => {
  const { train, firstStage, acfm } = useCompressor();
  if (train.error) return <ErrorNote>{train.error}</ErrorNote>;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">The machine</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Stages" value={String(train.stages.length)}
              accent="text-emerald-400" hint={`set by ${train.governedBy}`} />
            <Stat label="Ratio per stage" value={fmt(train.ratioPerStage, 2)}
              hint={`overall ${fmt(train.overallRatio, 2)}`} />
            <Stat label="Brake power" value={fmt(train.totalBrakeHp, 0)} unit="bhp"
              hint={`${fmt(train.totalGasHp, 0)} gas hp`} />
            <Stat label="Final discharge" value={fmt(train.finalDischargeF, 0)} unit="F" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="Interstage cooling" value={fmt(train.totalCoolingMMBtuHr, 2)} unit="MMBtu/hr"
              hint="a real exchanger somebody has to buy" />
            <Stat label="Inlet volume" value={fmt(acfm, 0)} unit="acfm"
              hint="what the machine screen turns on" />
          </div>
          <p className="text-[12px] text-slate-500">
            The stage count is the larger of what the ratio limit demands and what the discharge
            temperature demands. Here the {train.governedBy} governed. A ratio rule alone
            under-stages a hot or high-k gas, which is how a machine ends up running its valves
            and lube oil far above where they last.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Stage by stage</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Stage</th>
                  <th className="py-2 pr-3">Suction (psia)</th>
                  <th className="py-2 pr-3">Discharge (psia)</th>
                  <th className="py-2 pr-3">In (F)</th>
                  <th className="py-2 pr-3">Out (F)</th>
                  <th className="py-2 pr-3">Z avg</th>
                  <th className="py-2 pr-3">Gas hp</th>
                  <th className="py-2">Cooling (MMBtu/hr)</th>
                </tr>
              </thead>
              <tbody>
                {train.stages.map((s) => (
                  <tr key={s.stage} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-3 text-slate-300">{s.stage}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(s.pSuctionPsia, 0)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(s.pDischargePsia, 0)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(s.tSuctionF, 0)}</td>
                    <td className={`py-1.5 pr-3 tabular-nums ${s.warning ? 'text-amber-400' : ''}`}>
                      {fmt(s.tDischargeF, 0)}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(s.zAvg, 4)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(s.gasHp, 0)}</td>
                    <td className="py-1.5 tabular-nums">{s.coolingBtuHr ? fmt(s.coolingBtuHr / 1e6, 2) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {train.stages.filter((s) => s.warning).map((s) => (
            <WarnNote key={s.stage}>Stage {s.stage}: {s.warning}</WarnNote>
          ))}
        </CardContent>
      </Card>

      {!firstStage.error && (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Head, both ways</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Polytropic head" value={fmt(firstStage.headPolyFtLbfLbm, 0)} unit="ft lbf/lbm" />
              <Stat label="Isentropic head" value={fmt(firstStage.headIsenFtLbfLbm, 0)} unit="ft lbf/lbm" />
              <Stat label="Polytropic efficiency" value={fmt(firstStage.polytropicEfficiency, 3)} />
              <Stat label="Isentropic efficiency" value={fmt(firstStage.isentropicEfficiency, 3)}
                hint="always the lower of the two for compression" />
            </div>
            <p className="text-[12px] text-slate-500">
              Two idealisations of the same stage, shown together so neither gets quoted as the
              other. They give the same shaft power, because the actual work is the actual work;
              what differs is the reference path. The polytropic exponent carries the efficiency
              inside it, and using the isentropic exponent in its place is the classic error that
              under-predicts both the discharge temperature and the power.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export const ScreenResults = () => {
  const { screen, fuel, train, inputs } = useCompressor();
  const throughputMMscfd = parseFloat(inputs.duty.qMMscfd);
  if (screen.error) return <ErrorNote>{screen.error}</ErrorNote>;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Reciprocating or centrifugal</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="Inlet volume" value={fmt(screen.acfm, 0)} unit="acfm" />
            <Stat label="Overall ratio" value={fmt(train.overallRatio, 2)} />
            <Stat label="Indication" value={screen.recommendation}
              accent={screen.recommendation === 'either' ? 'text-slate-300' : 'text-emerald-400'} />
          </div>
          <ul className="space-y-1 list-disc list-inside text-[12px] text-slate-400">
            {screen.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="text-[12px] text-slate-500">
            This screens on the published selection criteria only: inlet volume, pressure ratio and
            power. Availability, footprint, maintenance philosophy and what the site already runs
            decide the rest, and no calculation settles those.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Driver fuel</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {fuel.error ? <ErrorNote>{fuel.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Fuel gas" value={fmt(fuel.fuelMMscfd, 3)} unit="MMscfd" />
                <Stat label="Driver thermal efficiency" value={fmt(fuel.thermalEfficiencyPct, 1)} unit="%" />
                <Stat label="Fuel as a share of throughput"
                  value={fmt((fuel.fuelMMscfd / Math.max(1e-9, throughputMMscfd)) * 100, 2)}
                  unit="%" hint="it comes out of the stream being compressed" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const SweepChart = () => {
  const { sweep } = useCompressor();
  if (sweep.error) return <ErrorNote>{sweep.error}</ErrorNote>;
  const data = sweep.rows.filter((r) => !r.error).map((r) => ({
    p: r.pDischargePsig,
    bhp: r.totalBrakeHp,
    stages: r.stages,
    fuel: r.fuelMMscfd,
  }));
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Power against discharge pressure</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ChartFrame height={300} exportFilename="compressor-power-sweep">
            <ComposedChart data={data} margin={{ top: 8, right: 40, bottom: 24, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis type="number" dataKey="p" domain={['dataMin', 'dataMax']}
                stroke={CHART_COLORS.axisLine} tick={tick}
                label={{ value: 'Discharge pressure (psig)', position: 'insideBottom', offset: -8, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <YAxis yAxisId="hp" stroke={CHART_COLORS.axisLine} tick={tick}
                label={{ value: 'Brake power (bhp)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <YAxis yAxisId="st" orientation="right" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={tick}
                label={{ value: 'Stages', angle: 90, position: 'insideRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [fmt(v, 1), n]}
                labelFormatter={(p) => `${fmt(p)} psig`} />
              <Legend verticalAlign="top" />
              <Bar yAxisId="st" dataKey="stages" name="Stages" fill="#94a3b8" />
              <Line yAxisId="hp" dataKey="bhp" name="Brake power (bhp)" stroke="#059669" strokeWidth={2} dot />
            </ComposedChart>
          </ChartFrame>
          <p className="text-[12px] text-slate-500">
            Power climbs smoothly with discharge pressure, but the stage count climbs in steps, and
            each step is a machine, a cooler and a foundation. The cheap discharge pressure is the
            one just below a step, not the one just above it.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Sweep detail</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Discharge (psig)</th>
                  <th className="py-2 pr-3">Ratio</th>
                  <th className="py-2 pr-3">Stages</th>
                  <th className="py-2 pr-3">Brake hp</th>
                  <th className="py-2 pr-3">Final out (F)</th>
                  <th className="py-2 pr-3">Cooling (MMBtu/hr)</th>
                  <th className="py-2">Fuel (MMscfd)</th>
                </tr>
              </thead>
              <tbody>
                {sweep.rows.map((r) => (
                  <tr key={r.pDischargePsig} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-3 text-slate-300">{fmt(r.pDischargePsig)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.error ? '--' : fmt(r.overallRatio, 2)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.error ? '--' : r.stages}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.error ? '--' : fmt(r.totalBrakeHp, 0)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.error ? '--' : fmt(r.finalDischargeF, 0)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.error ? '--' : fmt(r.coolingMMBtuHr, 2)}</td>
                    <td className="py-1.5 tabular-nums">{r.error ? '--' : fmt(r.fuelMMscfd, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
