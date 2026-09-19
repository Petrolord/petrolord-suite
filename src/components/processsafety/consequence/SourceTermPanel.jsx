// Source term (PS2): liquid or gas through a hole, the pool a spill makes and
// how fast that pool evaporates. Every number is the engine's.
import React from 'react';
import { useConsequenceStudio } from '@/contexts/ConsequenceStudioContext';
import {
  CONTAINMENTS, SPILL_SOURCES, formatSci,
} from '@/utils/processSafety/consequenceStudy';
import {
  Grid, LinkedValue, Note, NumField, Panel, Result, SelectField, Stat, StateBadge, refused,
} from './fields';

const LiquidRelease = () => {
  const { study, evaluation, setPart } = useConsequenceStudio();
  const l = study.source.liquid;
  const r = evaluation.source.liquid;
  const set = (patch) => setPart('source', 'liquid', patch);
  return (
    <Panel title="Liquid through a hole (Bernoulli)" testId="liquid-release">
      <Grid>
        <NumField label="Discharge coefficient Cd" unit="-" value={l.dischargeCoefficient} onChange={(v) => set({ dischargeCoefficient: v })} error={refused(r, 'dischargeCoefficient')} />
        <NumField label="Hole diameter" unit="mm" value={l.holeDiameterMm} onChange={(v) => set({ holeDiameterMm: v })} error={refused(r, 'holeDiameterM')} testId="liquid-hole-input" />
        <NumField label="Liquid density" unit="kg/m3" value={l.liquidDensityKgM3} onChange={(v) => set({ liquidDensityKgM3: v })} error={refused(r, 'liquidDensityKgM3')} />
        <NumField label="Liquid height above the hole" unit="m" value={l.liquidHeadM} onChange={(v) => set({ liquidHeadM: v })} error={refused(r, 'liquidHeadM')} />
        <NumField label="Pressure above the liquid" unit="bar absolute" value={l.pressureAboveLiquidBar} onChange={(v) => set({ pressureAboveLiquidBar: v })} error={refused(r, 'pressureAboveLiquidPa')} />
        <NumField label="Ambient pressure" unit="bar absolute" value={l.ambientPressureBar} onChange={(v) => set({ ambientPressureBar: v })} error={refused(r, 'ambientPressurePa')} />
      </Grid>
      <Result result={r}>
        <Grid cols="md:grid-cols-4">
          <Stat label="Release rate" unit="kg/s" value={formatSci(r.massRateKgS)} emphasis testId="liquid-rate" />
          <Stat label="Driving pressure" unit="kPa" value={formatSci(r.drivingPressurePa / 1000)} />
          <Stat label="Jet velocity" unit="m/s" value={formatSci(r.jetVelocityMS)} />
          <Stat label="Hole area" unit="m2" value={formatSci(r.holeAreaM2)} />
        </Grid>
      </Result>
    </Panel>
  );
};

const GasRelease = () => {
  const { study, evaluation, setPart } = useConsequenceStudio();
  const g = study.source.gas;
  const r = evaluation.source.gas;
  const set = (patch) => setPart('source', 'gas', patch);
  return (
    <Panel title="Gas through a hole (ideal gas, choked or subsonic)" testId="gas-release">
      <Grid>
        <NumField label="Discharge coefficient Cd" unit="-" value={g.dischargeCoefficient} onChange={(v) => set({ dischargeCoefficient: v })} error={refused(r, 'dischargeCoefficient')} />
        <NumField label="Hole diameter" unit="mm" value={g.holeDiameterMm} onChange={(v) => set({ holeDiameterMm: v })} error={refused(r, 'holeDiameterM')} />
        <NumField label="Upstream pressure" unit="bar absolute" value={g.upstreamPressureBar} onChange={(v) => set({ upstreamPressureBar: v })} error={refused(r, 'upstreamPressurePa')} testId="gas-p0-input" />
        <NumField label="Upstream temperature" unit="C" value={g.upstreamTemperatureC} onChange={(v) => set({ upstreamTemperatureC: v })} error={refused(r, 'upstreamTemperatureK')} />
        <NumField label="Molar mass" unit="g/mol" value={g.molarMassGMol} onChange={(v) => set({ molarMassGMol: v })} error={refused(r, 'molarMassKgMol')} />
        <NumField label="Heat capacity ratio gamma" unit="Cp/Cv" value={g.heatCapacityRatio} onChange={(v) => set({ heatCapacityRatio: v })} error={refused(r, 'heatCapacityRatio')} />
        <NumField label="Ambient pressure" unit="bar absolute" value={g.ambientPressureBar} onChange={(v) => set({ ambientPressureBar: v })} error={refused(r, 'ambientPressurePa')} />
      </Grid>
      <Result result={r}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
          <span>Flow regime</span>
          <StateBadge state={r.regime} testId="gas-regime" />
          <span className="text-xs text-slate-400">
            Choked when Pa/P0 is at or below the critical ratio (exactly at it counts as choked).
          </span>
        </div>
        <Grid cols="md:grid-cols-4">
          <Stat label="Release rate" unit="kg/s" value={formatSci(r.massRateKgS)} emphasis testId="gas-rate" />
          <Stat label="Pressure ratio Pa/P0" unit="-" value={formatSci(r.pressureRatio, 4)} />
          <Stat label="Critical pressure ratio" unit="-" value={formatSci(r.criticalPressureRatio, 4)} />
          <Stat label="Outflow coefficient psi" unit="-" value={formatSci(r.outflowCoefficientPsi, 4)} />
          <Stat label="Upstream density" unit="kg/m3" value={formatSci(r.upstreamDensityKgM3)} />
        </Grid>
      </Result>
      <Note>
        The opening values are the Yellow Book hydrogen case 2.6.2.1 (50 bar, 15 C, 100 mm, Cd 0.62,
        printed 15.31 kg/s at t = 0). The Yellow Book does not print gamma; 1.405 is inferred from its
        answer (1.40 gives 15.29 kg/s).
      </Note>
    </Panel>
  );
};

const PoolFromSpill = () => {
  const { study, evaluation, setPart } = useConsequenceStudio();
  const p = study.source.pool;
  const { pool, volume } = evaluation.source;
  const set = (patch) => setPart('source', 'pool', patch);
  return (
    <Panel title="Pool from a spill" testId="pool-from-spill">
      <Grid>
        <SelectField label="Spill volume" value={p.spillSource} options={SPILL_SOURCES} onChange={(v) => set({ spillSource: v })} />
        {p.spillSource === 'typed' ? (
          <NumField label="Spill volume" unit="m3" value={p.spillVolumeM3} onChange={(v) => set({ spillVolumeM3: v })} error={refused(pool, 'spillVolumeM3')} />
        ) : (
          <>
            <NumField label="Release duration" unit="s" value={p.releaseDurationS} onChange={(v) => set({ releaseDurationS: v })} error={refused(volume, 'releaseDurationS')} />
            <LinkedValue label="Spill volume" unit="m3" value={volume.error ? 'n/a' : formatSci(volume.volumeM3)} from="the liquid release x duration / density" testId="linked-spill-volume" />
          </>
        )}
        <SelectField label="Containment" value={p.containment} options={CONTAINMENTS} onChange={(v) => set({ containment: v })} />
        {p.containment === 'bund' ? (
          <>
            <NumField label="Bund floor area" unit="m2" value={p.bundAreaM2} onChange={(v) => set({ bundAreaM2: v })} error={refused(pool, 'bundAreaM2')} />
            <NumField label="Bund wall height (blank: not checked)" unit="m" value={p.bundWallHeightM} onChange={(v) => set({ bundWallHeightM: v })} error={refused(pool, 'bundWallHeightM')} />
          </>
        ) : (
          <NumField label="Pool thickness" unit="m" value={p.poolThicknessM} onChange={(v) => set({ poolThicknessM: v })} error={refused(pool, 'poolThicknessM')} />
        )}
      </Grid>
      {p.spillSource === 'liquid-release' ? (
        <Note>
          The spill volume is the studio&apos;s arithmetic on the engine&apos;s release rate: rate x duration / liquid
          density, at the constant initial rate (the tank is not drained as it empties).
        </Note>
      ) : null}
      <Result result={pool}>
        <Grid cols="md:grid-cols-4">
          <Stat label="Pool area" unit="m2" value={formatSci(pool.areaM2)} />
          <Stat label="Depth" unit="m" value={formatSci(pool.depthM)} />
          <Stat label="Equivalent diameter" unit="m" value={formatSci(pool.equivalentDiameterM, 5)} emphasis testId="pool-diameter" />
          <Stat label="Containment" value={pool.containment} />
        </Grid>
      </Result>
    </Panel>
  );
};

const Evaporation = () => {
  const { study, evaluation, setPart } = useConsequenceStudio();
  const e = study.source.evaporation;
  const r = evaluation.source.evaporation;
  const pool = evaluation.source.pool;
  const set = (patch) => setPart('source', 'evaporation', patch);
  return (
    <Panel title="Evaporation of a non-boiling pool (Mackay and Matsugu)" testId="evaporation">
      <Grid>
        <LinkedValue label="Pool diameter" unit="m" value={pool.error ? 'n/a' : formatSci(pool.equivalentDiameterM, 5)} from="Pool from a spill" />
        <NumField label="Wind speed at 10 m" unit="m/s" value={e.windSpeed10mMS} onChange={(v) => set({ windSpeed10mMS: v })} error={refused(r, 'windSpeed10mMS')} />
        <NumField label="Vapour pressure at the pool temperature" unit="kPa" value={e.vapourPressureKPa} onChange={(v) => set({ vapourPressureKPa: v })} error={refused(r, 'vapourPressurePa')} testId="vapour-pressure-input" />
        <NumField label="Molar mass" unit="g/mol" value={e.molarMassGMol} onChange={(v) => set({ molarMassGMol: v })} error={refused(r, 'molarMassKgMol')} />
        <NumField label="Liquid temperature" unit="C" value={e.liquidTemperatureC} onChange={(v) => set({ liquidTemperatureC: v })} error={refused(r, 'liquidTemperatureK')} />
        <NumField label="Schmidt number (blank: 0.8)" unit="-" value={e.schmidtNumber} onChange={(v) => set({ schmidtNumber: v })} error={refused(r, 'schmidtNumber')} />
        <NumField label="Ambient pressure" unit="bar absolute" value={e.ambientPressureBar} onChange={(v) => set({ ambientPressureBar: v })} error={refused(r, 'ambientPressurePa')} />
      </Grid>
      <Result result={r}>
        <Grid cols="md:grid-cols-3">
          <Stat label="Evaporation rate" unit="kg/s" value={formatSci(r.evaporationRateKgS)} emphasis testId="evaporation-rate" />
          <Stat label="Evaporation flux" unit="kg/(m2 s)" value={formatSci(r.evaporationFluxKgM2S)} />
          <Stat label="Mass transfer coefficient" unit="m/s" value={formatSci(r.massTransferCoefficientMS)} />
        </Grid>
      </Result>
      <Note>
        The pool temperature is yours: there is no heat balance. A vapour pressure at or above ambient is a
        boiling pool, which this model refuses. The benzene vapour pressure and the hole above are
        illustrative values.
      </Note>
    </Panel>
  );
};

const SourceTermPanel = () => (
  <div className="space-y-4">
    <Note>
      Two releases are worked side by side: a liquid one, which feeds the pool, and a gas one, whose rate
      the Dispersion tab can take. Pick which feeds the plume on that tab.
    </Note>
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
      <LiquidRelease />
      <GasRelease />
    </div>
    <PoolFromSpill />
    <Evaporation />
  </div>
);

export default SourceTermPanel;
