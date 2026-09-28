// Flow metering studio panels: the run, the plate sizing, and the
// uncertainty budget that is the actual point of the app.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { useMeter } from '@/contexts/MeterStudioContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput } from './fields';

const reLabel = (v) => {
  const n = Number(v);
  if (n >= 1e6) return `${Number((n / 1e6).toPrecision(2))}M`;
  if (n >= 1e3) return `${Number((n / 1e3).toPrecision(2))}k`;
  return String(Math.round(n));
};

export const RunInputs = () => {
  const { inputs, setSection } = useMeter();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Pipe ID (in)"><NumberInput section="run" name="pipeIdIn" step="0.001" /></Field>
        <Field label="Orifice bore (in)"><NumberInput section="run" name="orificeIdIn" step="0.001" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Differential (in H2O)"><NumberInput section="run" name="dpInH2O" /></Field>
        <Field label="Transmitter span (in H2O)" hint="Accuracy is quoted on span, so this sets the turndown penalty.">
          <NumberInput section="run" name="spanInH2O" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Static P1 (psia)"><NumberInput section="run" name="p1Psia" /></Field>
        <Field label="Density (lb/ft3)"><NumberInput section="run" name="densityLbFt3" step="0.01" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Viscosity (cp)"><NumberInput section="run" name="viscosityCp" step="0.001" /></Field>
        <Field label="k (Cp/Cv)"><NumberInput section="run" name="k" step="0.01" /></Field>
      </div>
      <Field label="Upstream fitting" hint="Sets the published straight-run requirement.">
        <Select value={inputs.run.upstreamFitting} onValueChange={(v) => setSection('run', 'upstreamFitting', v)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="singleElbow">Single elbow</SelectItem>
            <SelectItem value="twoElbowsSamePlane">Two elbows, same plane</SelectItem>
            <SelectItem value="twoElbowsDifferentPlanes">Two elbows, different planes</SelectItem>
            <SelectItem value="reducer">Reducer</SelectItem>
            <SelectItem value="fullBoreValve">Full bore valve</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold pt-2">Plate sizing</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Target flow (lb/hr)"><NumberInput section="sizing" name="targetMassLbHr" /></Field>
        <Field label="Design dP (in H2O)"><NumberInput section="sizing" name="designDpInH2O" /></Field>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold pt-2">Uncertainty budget</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cd (%)"><NumberInput section="uncertainty" name="cdUncertaintyPct" step="0.05" /></Field>
        <Field label="Expansibility (%)"><NumberInput section="uncertainty" name="expansibilityUncertaintyPct" step="0.05" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Bore (%)"><NumberInput section="uncertainty" name="boreUncertaintyPct" step="0.01" /></Field>
        <Field label="Pipe (%)"><NumberInput section="uncertainty" name="pipeUncertaintyPct" step="0.01" /></Field>
      </div>
      <Field label="Density (%)"><NumberInput section="uncertainty" name="densityUncertaintyPct" step="0.05" /></Field>
      <Field label="Transmitter accuracy (% of span)" hint="This IS the differential term of the budget: the reading and the span above turn it into a percentage of reading.">
        <NumberInput section="uncertainty" name="transmitterAccuracyPctOfSpan" step="0.005" />
      </Field>
    </div>
  );
};

export const FlowResults = () => {
  const { flow, sized, loss, straightRun, cdCurve } = useMeter();
  // Even 0.005 steps on the Cd axis (MET-T1-002: recharts chose 0.609,
  // 0.618, 0.635) and Reynolds numbers written as 3k, 10k, 1M.
  const cdTicks = (() => {
    const cds = (cdCurve?.rows || []).map((r) => r.cd).filter(Number.isFinite);
    if (!cds.length) return { domain: ['auto', 'auto'], ticks: undefined };
    const lo = Math.floor(Math.min(...cds) * 200) / 200;
    const hi = Math.ceil(Math.max(...cds) * 200) / 200;
    const ticks = [];
    for (let t = lo; t <= hi + 1e-9; t += 0.005) ticks.push(Number(t.toFixed(3)));
    return { domain: [lo, hi], ticks };
  })();
  const reTicks = (() => {
    const res = (cdCurve?.rows || []).map((r) => r.reynolds).filter((v) => v > 0);
    if (!res.length) return undefined;
    const out = [];
    for (let e = Math.ceil(Math.log10(Math.min(...res))); 10 ** e <= Math.max(...res); e += 1) out.push(10 ** e);
    return out;
  })();
  if (flow.error) return <ErrorNote>{flow.error}</ErrorNote>;
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">Flow through the plate you have</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Mass flow" value={fmt(flow.massLbHr, 0)} unit="lb/hr" />
            <Stat label="Beta ratio" value={fmt(flow.beta, 4)} />
            <Stat label="Discharge coefficient" value={fmt(flow.cd, 5)}
              hint="Reader-Harris/Gallagher, not a constant 0.61" />
            <Stat label="Pipe Reynolds" value={fmt(flow.reynolds, 0)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="Expansibility" value={fmt(flow.expansibility, 5)} />
            {!loss.error && (
              <Stat label="Permanent loss" value={fmt(loss.lossInH2O, 1)} unit="in H2O"
                hint={`${fmt(loss.lossFraction * 100, 0)} percent of the differential, lost for good`} />
            )}
          </div>
          {flow.warning && <WarnNote>{flow.warning}</WarnNote>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">The plate a target flow needs</CardTitle></CardHeader>
        <CardContent>
          {sized.error ? <ErrorNote>{sized.error}</ErrorNote> : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Bore" value={fmt(sized.orificeIdIn, 4)} unit="in" accent="text-pl-text" />
                <Stat label="Beta" value={fmt(sized.beta, 4)} />
                <Stat label="Flow it passes" value={fmt(sized.massLbHr, 0)} unit="lb/hr" />
                <Stat label="Cd at that bore" value={fmt(sized.cd, 5)} />
              </div>
              {/* The warning the engine attached to THIS number used to be
                  dropped, because only the flow card's warning was rendered. */}
              {sized.warning && <WarnNote>{sized.warning}</WarnNote>}
              <p className="text-[12px] text-pl-muted first-letter:uppercase">{sized.boreNote}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {!cdCurve.error && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">The coefficient is not a constant</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ChartFrame height={260} exportFilename="discharge-coefficient">
              <ComposedChart data={cdCurve.rows} margin={{ top: 8, right: 30, bottom: 8, left: 20 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis height={XAXIS_LABEL_HEIGHT} type="number" dataKey="reynolds" scale="log" domain={['dataMin', 'dataMax']}
                  stroke={CHART_COLORS.axisLine} tick={tick}
                  tickFormatter={reLabel} ticks={reTicks}
                  label={{ value: 'Pipe Reynolds number', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
                  domain={cdTicks.domain} ticks={cdTicks.ticks}
                  tickFormatter={(v) => Number(v).toFixed(3)} width={52}
                  label={{ value: 'Cd', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmt(v, 5), 'Cd']}
                  labelFormatter={(v) => `Re ${Number(v).toExponential(1)}` } />
                <Legend {...LEGEND_PROPS} />
                <Line dataKey="cd" name="Cd at this beta" stroke="#059669" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ChartFrame>
            <p className="text-[12px] text-pl-muted">
              At this beta the coefficient moves {fmt(cdCurve.spanPctAtThisBeta, 1)} percent across
              the Reynolds range drawn here, and it moves several times that across the beta range
              as well. Either figure is many times the uncertainty anybody argues about in a
              custody transfer dispute, which is why the published equation is worth computing
              rather than assuming 0.61.
            </p>
            <p className="text-[12px] text-pl-muted first-letter:uppercase">{cdCurve.reynoldsBasis}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">Meter run</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {straightRun.error ? <ErrorNote>{straightRun.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Upstream straight run" value={fmt(straightRun.upstreamDiameters, 0)} unit="diameters" />
                <Stat label="Downstream" value={fmt(straightRun.downstreamDiameters, 0)} unit="diameters" />
              </div>
              <p className="text-[12px] text-pl-muted first-letter:uppercase">{straightRun.note}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const UncertaintyResults = () => {
  const { uncertainty, transmitter } = useMeter();
  if (uncertainty.error) return <ErrorNote>{uncertainty.error}</ErrorNote>;
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  const data = uncertainty.contributions.map((c) => ({
    name: c.name, share: c.shareOfVariancePct,
  }));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">Where the uncertainty comes from</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total uncertainty" value={fmt(uncertainty.totalUncertaintyPct, 3)} unit="%"
              accent="text-pl-text" hint="root sum square of the contributions" />
            <Stat label="Dominant term" value={uncertainty.dominant}
              accent={uncertainty.dominanceIsClear ? 'text-pl-warning-text' : 'text-pl-text'}
              hint={`${fmt(uncertainty.dominantShareOfVariancePct, 1)} percent of the variance`} />
            <Stat label="Runner up" value={uncertainty.runnerUp}
              hint={`${fmt(uncertainty.runnerUpShareOfVariancePct, 1)} percent`} />
            <Stat label="Differential term" value={fmt(uncertainty.differentialUncertaintyPct, 3)} unit="%"
              hint="from the transmitter, not typed" />
          </div>
          <p className="text-[12px] text-pl-muted first-letter:uppercase">{uncertainty.differentialUncertaintySource}</p>
          <ChartFrame height={260} exportFilename="uncertainty-budget">
            <ComposedChart data={data} layout="vertical" margin={{ top: 8, right: 30, bottom: 8, left: 120 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis height={XAXIS_LABEL_HEIGHT} type="number" stroke={CHART_COLORS.axisLine} tick={tick}
                label={{ value: 'Share of variance (%)', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <YAxis type="category" dataKey="name" width={115} stroke={CHART_COLORS.axisLine}
                tick={{ ...tick, fontSize: 10 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${fmt(v, 1)} %`, 'share of variance']} />
              <Bar dataKey="share" name="Share of variance (%)" fill="#0ea5e9" />
            </ComposedChart>
          </ChartFrame>
          <WarnNote>{uncertainty.note}</WarnNote>
          <p className="text-[12px] text-pl-muted">
            This is the actual point of a metering study. The flow equation is simple; what a
            custody transfer argument is about is how well the number is known, and which term to
            spend money on improving. Which term that is depends on where the run sits in its
            span: at the top of the span the discharge coefficient's own uncertainty usually leads,
            and the differential transmitter takes over as the reading falls. The chart above is
            the answer for this run rather than a rule of thumb, and the differential term in it
            is the transmitter's own contribution rather than a separate typed figure.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">Turndown and the transmitter</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {transmitter.error ? <ErrorNote>{transmitter.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Differential turndown" value={fmt(transmitter.differentialTurndown, 1)} unit="to 1"
                  hint="span over reading" />
                <Stat label="Flow turndown" value={fmt(transmitter.flowTurndown, 2)} unit="to 1"
                  accent={transmitter.flowTurndown > transmitter.flowTurndownLimit ? 'text-pl-warning-text' : 'text-pl-success-text'}
                  hint={`the customary limit is ${transmitter.flowTurndownLimit} to 1`} />
                <Stat label="Transmitter contribution" value={fmt(transmitter.uncertaintyPctOfReading, 3)} unit="% of reading"
                  hint="accuracy is quoted on span, so this rises as the reading falls" />
              </div>
              {transmitter.warning && <WarnNote>{transmitter.warning}</WarnNote>}
              <p className="text-[12px] text-pl-muted first-letter:uppercase">{transmitter.turndownNote}</p>
              <p className="text-[12px] text-pl-muted">
                A transmitter accurate to a fixed fraction of its span becomes proportionally less
                accurate as the reading falls. That single fact is why an orifice run has a usable
                FLOW turndown of about three to one, and it is the most misunderstood thing in gas
                measurement. Watch which turndown is being quoted: flow goes as the square root of
                the differential, so a three to one flow turndown is a nine to one differential
                turndown, and the two get swapped constantly.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
