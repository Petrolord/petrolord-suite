// Produced water studio panels: water and train inputs, the stage
// results, the droplet distribution, and the device detail.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useProducedWater, num } from '@/contexts/ProducedWaterContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput, Row } from './fields';

const STAGE_OPTIONS = {
  primary: ['none', 'api', 'cpi'],
  secondary: ['none', 'hydrocyclone', 'igf', 'daf'],
  tertiary: ['none', 'nutshell', 'media'],
};

const FIELD_LABELS = {
  flowBwpd: 'Flow (bwpd)', oiwPpm: 'Inlet OIW (ppm)', tdsPpm: 'TDS (ppm)',
  tF: 'Temperature (F)', oilApi: 'Oil gravity (API)', specPpm: 'Discharge spec (ppm)',
  inletD50Micron: 'Inlet droplet d50 (um)', sigma: 'Distribution sigma',
  lengthM: 'Length (m)', widthM: 'Width (m)', depthM: 'Depth (m)',
  shortCircuitF: 'Short-circuit factor F', plateAreaM2: 'Plate area (m2)',
  nPlates: 'Plates', efficiencyFactor: 'Efficiency', nLiners: 'Liners',
  linerDiameterMm: 'Liner bore (mm)', linerLengthM: 'Liner length (m)',
  designFlowPerLinerM3H: 'Design flow per liner (m3/h)', gFieldAtDesign: 'Field at design flow (g)',
  cellVolumeM3: 'Cell volume (m3)', nCells: 'Cells', cellDepthM: 'Cell depth (m)',
  gasRatio: 'Gas ratio', bubbleMicron: 'Bubble size (um)', areaM2: 'Bed area (m2)',
  bedDepthM: 'Bed depth (m)', mediaMicron: 'Media grain (um)',
  filterCoefficientPerM: 'Filter coefficient (1/m)',
};

/** Boxes holding something the studio cannot read as a number at all. */
export const InputFormatNote = () => {
  const { numberFormatIssues } = useProducedWater();
  if (!numberFormatIssues.length) return null;
  return (
    <ErrorNote>
      <p className="font-semibold mb-1">These boxes do not hold a number:</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {numberFormatIssues.map((i) => (
          <li key={`${i.section}.${i.key}`}>
            {FIELD_LABELS[i.key] || i.key}: &quot;{i.raw}&quot;
          </li>
        ))}
      </ul>
      <p className="mt-1">
        Type digits only. A thousands separator or a stray character is not read as part of the
        number, so 50,000 would otherwise be treated as 50.
      </p>
    </ErrorNote>
  );
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
        <Field label="TDS (ppm)" hint="Salinity thickens the brine and lifts its density. The correction is stated to 300,000 ppm and refuses above it.">
          <NumberInput section="water" name="tdsPpm" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Oil gravity (API)"><NumberInput section="water" name="oilApi" step="0.1" /></Field>
        <Field label="Discharge spec (ppm)" hint="Your own permit or regulation. This studio states no limit of its own, and a limit written in mg/l is a conversion you make against the brine density shown below.">
          <NumberInput section="water" name="specPpm" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Inlet droplet d50 (um)" hint="Shear from pumps and chokes drives this down; it is the single most important number here.">
          <NumberInput section="water" name="inletD50Micron" />
        </Field>
        <Field label="Distribution sigma" hint="Log-standard-deviation, customarily 0.6 to 0.9. Outside 0.5 to 1.0 the studio warns.">
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
  const {
    inputs, applyFlotationPreset, applyFilterPreset, flotationPresets, filterPresets,
  } = useProducedWater();
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
          <Field label="Short-circuit factor F" hint="API 421 turbulence and short-circuiting allowance, customarily 1.3 to 1.8.">
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
          <div className="grid grid-cols-3 gap-2">
            <Field label="Liners"><NumberInput section="hydrocyclone" name="nLiners" step="1" /></Field>
            <Field label="Liner bore (mm)"><NumberInput section="hydrocyclone" name="linerDiameterMm" step="1" /></Field>
            <Field label="Liner length (m)"><NumberInput section="hydrocyclone" name="linerLengthM" step="0.05" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Design flow per liner (m3/h)" hint="What one liner is rated for. The bank is sized against it.">
              <NumberInput section="hydrocyclone" name="designFlowPerLinerM3H" step="0.01" />
            </Field>
            <Field label="Field at design flow (g)" hint="The centrifugal field the liner develops at its design flow. A declared figure. No vendor curve is built in, so put your own number here if you have one.">
              <NumberInput section="hydrocyclone" name="gFieldAtDesign" step="50" />
            </Field>
          </div>
        </>
      )}
      {(uses('igf') || uses('daf')) && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Flotation</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Cell volume (m3)"><NumberInput section="flotation" name="cellVolumeM3" step="0.5" /></Field>
            <Field label="Cells"><NumberInput section="flotation" name="nCells" step="1" /></Field>
            <Field label="Cell depth (m)"><NumberInput section="flotation" name="cellDepthM" step="0.1" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Gas ratio" hint="Gas into each cell as a fraction of the water flow.">
              <NumberInput section="flotation" name="gasRatio" step="0.01" />
            </Field>
            <Field label="Bubble size (um)" hint="Finer bubbles carry more surface for the same gas, so they cut finer.">
              <NumberInput section="flotation" name="bubbleMicron" step="10" />
            </Field>
          </div>
          <div className="flex gap-1.5">
            {Object.entries(flotationPresets).map(([key, p]) => (
              <Button key={key} variant="outline" size="sm" className="h-7 text-[11px] flex-1"
                onClick={() => applyFlotationPreset(key)}>
                {p.label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-slate-600">
            These two boxes are the whole difference between induced and dissolved gas flotation.
            Dissolved gas makes far finer bubbles and releases much less gas, and both effects are
            in the answer.
          </p>
        </>
      )}
      {(uses('nutshell') || uses('media')) && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Filter</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Bed area (m2)" hint="A bigger bed loads the media more slowly, which lifts the capture per metre and sharpens the cut. Below 1 m/h of loading the studio stops answering and says so: the filter coefficient is declared at 10 m/h and there is no calibration that far under it.">
              <NumberInput section="filter" name="areaM2" step="0.5" />
            </Field>
            <Field label="Bed depth (m)"><NumberInput section="filter" name="bedDepthM" step="0.1" /></Field>
            <Field label="Media grain (um)"><NumberInput section="filter" name="mediaMicron" step="50" /></Field>
          </div>
          <Field label="Filter coefficient (1/m)" hint="Capture per metre of bed at a 20 um droplet, 800 um media and 10 m/hr. A declared figure with no published source.">
            <NumberInput section="filter" name="filterCoefficientPerM" step="0.1" />
          </Field>
          <div className="flex gap-1.5">
            {Object.entries(filterPresets).map(([key, p]) => (
              <Button key={key} variant="outline" size="sm" className="h-7 text-[11px] flex-1"
                onClick={() => applyFilterPreset(key)}>
                {p.label}
              </Button>
            ))}
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

/**
 * What each device is actually doing, including the numbers the app
 * used to supply silently: the liner turndown and field, the flotation
 * gas rate and holdup, the filter loading and coefficient.
 */
export const DeviceDetail = () => {
  const { devices, inputs } = useProducedWater();
  if (devices.error || !devices.list?.length) return null;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Inside each device</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {devices.list.map((d, i) => (
          <div key={`${d.key}-${i}`} className="space-y-0.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{d.name}</p>
            {d.error && <ErrorNote>{d.error}</ErrorNote>}
            {!d.error && (d.key === 'api' || d.key === 'cpi') && (
              <>
                <Row label="Design rise the droplet must beat" value={`${fmt(d.designRiseMS * 1000, 4)} mm/s`} />
                {d.overflowRateMS !== undefined && (
                  <Row label="Surface loading" value={`${fmt(d.overflowRateMS * 3600, 3)} m/h`} />
                )}
                {d.effectiveAreaM2 !== undefined && (
                  <Row label="Effective settling area" value={`${fmt(d.effectiveAreaM2, 1)} m2`} />
                )}
                {d.horizontalVelocityMS !== undefined && (
                  <Row label="Horizontal velocity" value={`${fmt(d.horizontalVelocityMS * 1000, 2)} mm/s`}
                    hint={`the fixed half of the API 421 limit is ${fmt(d.horizontalVelocityLimitMS * 1000, 0)} mm/s`} />
                )}
                <Row label="Reynolds number of the cut droplet" value={fmt(d.cutReynolds, 3)}
                  hint="Stokes is creeping flow: above about 1 this cut size is optimistic" />
              </>
            )}
            {!d.error && d.key === 'hydrocyclone' && (
              <>
                <Row label="Flow per liner" value={`${fmt(d.perLinerM3S * 3600, 3)} m3/h`} />
                <Row label="Turndown against design" value={`${fmt(d.turndownRatio, 3)} x`}
                  hint={`${d.linersAtDesignFlow} liners would sit exactly at the design point`} />
                <Row label="Centrifugal field" value={`${fmt(d.gField, 0)} g`}
                  hint="it stops rising once the liner is past its operating envelope" />
                <Row label="Residence in the liner" value={`${fmt(d.residenceS, 3)} s`} />
                <Row label="Radial distance the median droplet crosses" value={`${fmt(d.radialTravelM * 1000, 2)} mm`} />
                {d.shearPenalty > 1 && (
                  <Row label="Inlet shear penalty on the cut" value={`${fmt(d.shearPenalty, 3)} x`} />
                )}
              </>
            )}
            {!d.error && (d.key === 'igf' || d.key === 'daf') && (
              <>
                <Row label="Residence over all cells" value={`${fmt(d.residenceS, 0)} s`}
                  hint={d.residenceWarnS > 0
                    ? `this studio warns below ${fmt(d.residenceWarnS, 0)} s. That threshold is a declared round figure with no flotation residence measurement behind it.`
                    : undefined} />
                <Row label="Gas into each cell" value={`${fmt(d.gasFlowPerCellM3S * 3600, 1)} m3/h`}
                  hint={`${fmt(d.totalGasFlowM3S * 3600, 1)} m3/h over the whole unit`} />
                <Row label="Superficial gas velocity" value={`${fmt(d.superficialGasMS * 1000, 2)} mm/s`} />
                <Row label="Bubble rise" value={`${fmt(d.bubbleRiseMS * 1000, 1)} mm/s`}
                  hint={`Reynolds ${fmt(d.bubbleReynolds, 1)}, so this is the drag law and not Stokes`} />
                <Row label="Gas holdup" value={`${fmt(d.gasHoldup * 100, 1)} %`} />
              </>
            )}
            {!d.error && (d.key === 'nutshell' || d.key === 'media') && (
              <>
                <Row label="Loading rate" value={`${fmt(d.loadingMHr, 1)} m/h`}
                  hint={d.loadingFloorMHr > 0
                    ? `this studio stops answering below ${fmt(d.loadingFloorMHr, 0)} m/h, where the filter coefficient has no calibration. A bed past about ${fmt((num(inputs.filter.areaM2) * d.loadingMHr) / d.loadingFloorMHr, 0)} m2 would take this flow under that floor.`
                    : undefined} />
                <Row label="Filter coefficient at this loading" value={`${fmt(d.filterCoefficientPerM, 3)} 1/m`}
                  hint={`at the ${fmt(d.referenceDropletMicron, 0)} um reference droplet and ${fmt(d.mediaMicron, 0)} um media`} />
                <Row label="Removal of a reference droplet" value={`${fmt(d.removalAtRefDroplet * 100, 1)} %`} />
                <Row label="Bed depth" value={`${fmt(d.bedDepthM, 2)} m`} />
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export const TrainResults = () => {
  const { result } = useProducedWater();
  if (result.error) return <ErrorNote>{result.error}</ErrorNote>;
  const withheld = result.meetsSpec === null;
  return (
    <div className="space-y-4">
      {result.verdictWithheldReason && (
        <ErrorNote>
          <span className="font-semibold">No verdict. </span>
          {result.verdictWithheldReason}
        </ErrorNote>
      )}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Treated water</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Outlet oil in water" value={fmt(result.outletOiwPpm, 1)} unit="ppm"
              accent={result.meetsSpec === false ? 'text-red-400'
                : (result.meetsSpec === true ? 'text-emerald-400' : 'text-slate-100')}
              hint={result.complete ? undefined : result.overallRemovalBasis} />
            <Stat label="Overall removal" value={fmt(result.overallRemovalPct, 1)} unit="%"
              hint={result.overallRemovalBasis} />
            <Stat label="Droplet median out" value={fmt(result.outletMedianMicron, 1)} unit="um"
              hint={`in at ${fmt(result.inletMedianMicron, 1)} um, measured the same way`} />
            <Stat label="Against spec"
              value={withheld ? '--' : (result.meetsSpec ? 'MEETS' : 'FAILS')}
              accent={withheld ? 'text-slate-400' : (result.meetsSpec ? 'text-emerald-400' : 'text-red-400')}
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
          <p className="text-[11px] text-slate-600">{result.dissolvedOilNote}</p>
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
                  <tr key={`${s.name}-${i}`} className={`border-b border-slate-800/60 ${s.ran ? '' : 'bg-red-950/20'}`}>
                    <td className="py-1.5 pr-3 text-slate-300">{s.name || 'device'}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{s.ran ? fmt(s.d50cMicron, 1) : 'did not run'}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{s.ran ? fmt(s.removalPct, 1) : '--'}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{s.ran ? fmt(s.outletOiwPpm, 1) : '--'}</td>
                    <td className="py-1.5 tabular-nums">{s.ran ? fmt(s.outletMedianMicron, 1) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.stages.filter((s) => s.warning || s.error).map((s, i) => (
            <WarnNote key={`${s.name}-${i}`}>{s.name}: {s.warning || s.error}</WarnNote>
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
  const { distribution, result } = useProducedWater();
  if (distribution.error) return <ErrorNote>{distribution.error}</ErrorNote>;
  const data = distribution.bins.map((b) => ({
    d: Number(b.dMicron.toFixed(2)),
    vol: b.volumeFraction * 100,
  }));
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  const cuts = result.error ? [] : result.stages.filter((s) => s.ran);
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
              <ReferenceLine key={`${s.name}-${i}`} x={Number(s.d50cMicron?.toFixed(2))}
                stroke={['#059669', '#d97706', '#dc2626'][i % 3]} strokeDasharray="4 3"
                label={{ value: s.name, position: 'top', fill: CHART_COLORS.axisText, fontSize: 10 }} />
            ))}
          </ComposedChart>
        </ChartFrame>
        <p className="text-[12px] text-slate-500">
          Everything to the left of a device&apos;s cut line is what that device mostly misses. A
          train whose cut lines all sit to the right of the bulk of the oil volume will not meet its
          spec however many stages it has, which is the picture behind the numbers. The bars are the
          same {distribution.nBins} bins the train itself integrates, so the picture and the numbers
          describe one distribution.
        </p>
      </CardContent>
    </Card>
  );
};
