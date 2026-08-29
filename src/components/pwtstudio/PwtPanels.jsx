// Produced water studio panels: water and train inputs, the stage
// results, the droplet distribution, and the device detail.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useProducedWater } from '@/contexts/ProducedWaterContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput } from './fields';

const STAGE_OPTIONS = {
  primary: ['none', 'api', 'cpi'],
  secondary: ['none', 'hydrocyclone', 'igf', 'daf'],
  tertiary: ['none', 'nutshell', 'media'],
};

export const WaterInputs = () => {
  const { inputs, setSection, applyPreset, presets } = useProducedWater();
  return (
    <div className="space-y-4">
      <Field label="Water preset">
        <div className="flex flex-col gap-1.5">
          {Object.entries(presets).map(([key, p]) => (
            <Button key={key} variant="outline" size="sm" className="justify-start h-8 text-xs"
              onClick={() => applyPreset(key)}>
              {p.label}
            </Button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Flow (bwpd)"><NumberInput section="water" name="flowBwpd" /></Field>
        <Field label="Inlet OIW (ppm)"><NumberInput section="water" name="oiwPpm" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Temperature (F)" hint="Sets the water viscosity, which sets what every device can catch.">
          <NumberInput section="water" name="tF" />
        </Field>
        <Field label="TDS (ppm)" hint="Salinity thickens the brine and lifts its density.">
          <NumberInput section="water" name="tdsPpm" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Oil gravity (API)"><NumberInput section="water" name="oilApi" step="0.1" /></Field>
        <Field label="Discharge spec (ppm)" hint="29 ppm monthly average is the common offshore limit.">
          <NumberInput section="water" name="specPpm" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Inlet droplet d50 (um)" hint="Shear from pumps and chokes drives this down; it is the single most important number here.">
          <NumberInput section="water" name="inletD50Micron" />
        </Field>
        <Field label="Distribution sigma" hint="Log-standard-deviation, customarily 0.6 to 0.9.">
          <NumberInput section="water" name="sigma" step="0.05" />
        </Field>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Train</p>
      {['primary', 'secondary', 'tertiary'].map((stage) => (
        <Field key={stage} label={`${stage.charAt(0).toUpperCase()}${stage.slice(1)}`}>
          <Select value={inputs.train[stage]} onValueChange={(v) => setSection('train', stage, v)}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS[stage].map((k) => (
                <SelectItem key={k} value={k}>
                  {k === 'none' ? 'None' : (k === 'api' ? 'API 421 separator'
                    : k === 'cpi' ? 'Plate interceptor'
                      : k === 'hydrocyclone' ? 'De-oiling hydrocyclone'
                        : k === 'igf' ? 'Induced gas flotation'
                          : k === 'daf' ? 'Dissolved gas flotation'
                            : k === 'nutshell' ? 'Walnut shell filter' : 'Multi-media filter')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ))}
    </div>
  );
};

export const EquipmentInputs = () => {
  const { inputs } = useProducedWater();
  const t = inputs.train;
  const uses = (k) => Object.values(t).includes(k);
  return (
    <div className="space-y-4">
      {uses('api') && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">API basin</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Length (m)"><NumberInput section="api" name="lengthM" step="0.5" /></Field>
            <Field label="Width (m)"><NumberInput section="api" name="widthM" step="0.1" /></Field>
            <Field label="Depth (m)"><NumberInput section="api" name="depthM" step="0.1" /></Field>
          </div>
          <Field label="Short-circuit factor F" hint="API 421 turbulence and short-circuiting allowance, 1.3 to 1.8.">
            <NumberInput section="api" name="shortCircuitF" step="0.1" />
          </Field>
        </>
      )}
      {uses('cpi') && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Plate pack</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Plate area (m2)"><NumberInput section="cpi" name="plateAreaM2" step="0.1" /></Field>
            <Field label="Plates"><NumberInput section="cpi" name="nPlates" step="1" /></Field>
            <Field label="Efficiency"><NumberInput section="cpi" name="efficiencyFactor" step="0.05" /></Field>
          </div>
        </>
      )}
      {uses('hydrocyclone') && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Hydrocyclone</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Liners"><NumberInput section="hydrocyclone" name="nLiners" step="1" /></Field>
            <Field label="Liner bore (mm)"><NumberInput section="hydrocyclone" name="linerDiameterMm" step="1" /></Field>
          </div>
        </>
      )}
      {(uses('igf') || uses('daf')) && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Flotation</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cell volume (m3)"><NumberInput section="flotation" name="cellVolumeM3" step="0.5" /></Field>
            <Field label="Cells"><NumberInput section="flotation" name="nCells" step="1" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Gas ratio"><NumberInput section="flotation" name="gasRatio" step="0.05" /></Field>
            <Field label="Bubble size (um)" hint="Dissolved gas flotation makes far finer bubbles than induced.">
              <NumberInput section="flotation" name="bubbleMicron" step="10" />
            </Field>
          </div>
        </>
      )}
      {(uses('nutshell') || uses('media')) && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Filter</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bed area (m2)"><NumberInput section="filter" name="areaM2" step="0.5" /></Field>
            <Field label="Bed depth (m)"><NumberInput section="filter" name="bedDepthM" step="0.1" /></Field>
          </div>
        </>
      )}
    </div>
  );
};

export const FluidCard = () => {
  const { fluid } = useProducedWater();
  if (fluid.error) return <ErrorNote>{fluid.error}</ErrorNote>;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">The water itself</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Water viscosity" value={fmt(fluid.muCp, 3)} unit="cp"
            hint={`salinity multiplies it by ${fmt(fluid.salinityFactor, 3)}`} />
          <Stat label="Water density" value={fmt(fluid.rhoWater, 1)} unit="kg/m3" />
          <Stat label="Oil density" value={fmt(fluid.rhoOil, 1)} unit="kg/m3" />
          <Stat label="Density difference" value={fmt(fluid.deltaRho, 1)} unit="kg/m3"
            accent={fluid.deltaRho < 60 ? 'text-amber-400' : 'text-emerald-400'}
            hint="the whole driving force for gravity separation" />
        </div>
        {fluid.deltaRho < 60 && (
          <WarnNote>
            Under about 60 kg/m3 of density difference, gravity separation gets slow and unreliable:
            heavy oil in hot brine is the classic case where a plate pack that works on paper
            disappoints in the field.
          </WarnNote>
        )}
      </CardContent>
    </Card>
  );
};

export const TrainResults = () => {
  const { result, devices, inputs } = useProducedWater();
  if (result.error) return <ErrorNote>{result.error}</ErrorNote>;
  const spec = parseFloat(inputs.water.specPpm);
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Treated water</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Outlet oil in water" value={fmt(result.outletOiwPpm, 1)} unit="ppm"
              accent={result.meetsSpec === false ? 'text-red-400' : 'text-emerald-400'} />
            <Stat label="Overall removal" value={fmt(result.overallRemovalPct, 1)} unit="%" />
            <Stat label="Droplet median out" value={fmt(result.outletMedianMicron, 1)} unit="um"
              hint={`in at ${fmt(result.inletMedianMicron, 1)} um`} />
            <Stat label="Against spec"
              value={result.meetsSpec === null ? '--' : (result.meetsSpec ? 'MEETS' : 'FAILS')}
              accent={result.meetsSpec ? 'text-emerald-400' : 'text-red-400'}
              hint={Number.isFinite(result.marginPpm)
                ? `${result.marginPpm >= 0 ? 'margin' : 'over'} ${fmt(Math.abs(result.marginPpm), 1)} ppm`
                : undefined} />
          </div>
          {result.meetsSpec === false && (
            <WarnNote>
              The train misses the spec. The water leaving each device is finer than the water that
              entered it, so adding another stage of the same kind buys less than the first one did.
              Coarser inlet droplets, less upstream shear or a finer-cutting device are the levers
              that actually move this.
            </WarnNote>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Stage by stage</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Device</th>
                  <th className="py-2 pr-3">Cut size d50c (um)</th>
                  <th className="py-2 pr-3">Removal (%)</th>
                  <th className="py-2 pr-3">Outlet OIW (ppm)</th>
                  <th className="py-2">Droplet median out (um)</th>
                </tr>
              </thead>
              <tbody>
                {result.stages.map((s, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={i} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-3 text-slate-300">{s.name || 'device'}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{s.error ? '--' : fmt(s.d50cMicron, 1)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{s.error ? '--' : fmt(s.removalPct, 1)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{s.error ? '--' : fmt(s.outletOiwPpm, 1)}</td>
                    <td className="py-1.5 tabular-nums">{s.error ? '--' : fmt(s.outletMedianMicron, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.stages.filter((s) => s.warning || s.error).map((s, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <WarnNote key={i}>{s.name}: {s.warning || s.error}</WarnNote>
          ))}
          <p className="text-[12px] text-slate-500">
            Each device removes the droplets it can catch and passes on the ones it cannot, so the
            median falls down the train and every stage faces harder water than the one before it.
            That is why three devices that each remove ninety percent of THEIR inlet do not together
            remove 99.9 percent of the original.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export const DistributionChart = () => {
  const { distribution, result, inputs } = useProducedWater();
  if (distribution.error) return null;
  const data = distribution.bins.map((b) => ({
    d: Number(b.dMicron.toFixed(1)),
    vol: b.volumeFraction * 100,
  }));
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  const cuts = result.error ? [] : result.stages.filter((s) => !s.error);
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Inlet droplets against the cut sizes</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ChartFrame height={300} exportFilename="droplet-distribution">
          <ComposedChart data={data} margin={{ top: 8, right: 30, bottom: 24, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" dataKey="d" scale="log" domain={['dataMin', 'dataMax']}
              stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Droplet diameter (um)', position: 'insideBottom', offset: -8, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Oil volume (%)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(v, 2)} %`, 'oil volume']}
              labelFormatter={(d) => `${fmt(d, 1)} um`} />
            <Legend verticalAlign="top" />
            <Bar dataKey="vol" name="Inlet oil volume (%)" fill="#0ea5e9" />
            {cuts.map((s, i) => (
              <ReferenceLine key={s.name} x={Number(s.d50cMicron?.toFixed(1))}
                stroke={['#059669', '#d97706', '#dc2626'][i % 3]} strokeDasharray="4 3"
                label={{ value: s.name, position: 'top', fill: CHART_COLORS.axisText, fontSize: 10 }} />
            ))}
          </ComposedChart>
        </ChartFrame>
        <p className="text-[12px] text-slate-500">
          Everything to the left of a device's cut line is what that device mostly misses. A train
          whose cut lines all sit to the right of the bulk of the oil volume will not meet its spec
          however many stages it has, which is the picture behind the numbers.
        </p>
      </CardContent>
    </Card>
  );
};
