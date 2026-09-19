// Fire (PS2): a pool fire by the solid-flame model. Burning rate, flame
// length, tilt, surface emissive power, view factor, transmissivity and the
// heat flux at a target, a heat flux curve against distance and the distance
// to a heat flux. Every number is the engine's.
import React from 'react';
import { useConsequenceStudio } from '@/contexts/ConsequenceStudioContext';
import {
  BURNING_METHODS, DIAMETER_SOURCES, FLAME_LENGTH_METHODS, HEAT_DISTANCE_STATE_TEXT, POOL_FIRE_FUELS,
  SEP_METHODS, TRANSMISSIVITY_MODES, UNIT, formatSci,
} from '@/utils/processSafety/consequenceStudy';
import ConsequenceChart from './ConsequenceChart';
import {
  BasisList, EngineError, Grid, LinkedValue, Note, NumField, Panel, Result, SelectField, Stat,
  StateBadge, refused,
} from './fields';

const FUEL_OPTIONS = Object.entries(POOL_FIRE_FUELS).map(([id, f]) => ({
  id,
  label: `${id} (m"inf ${f.massBurningFluxInfKgM2S} kg/(m2 s), k beta ${f.kBetaPerM === null ? 'none' : `${f.kBetaPerM} /m`})`,
}));

const kw = (w) => formatSci(w / UNIT.W_PER_KW);

const FireInputs = () => {
  const { study, evaluation, setSection } = useConsequenceStudio();
  const f = study.fire;
  const e = evaluation.fire;
  const set = (patch) => setSection('fire', patch);
  const failed = [e.diameter, e.burning, e.flame].find((r) => r?.error);
  return (
    <>
      <Panel title="Pool and burning rate" testId="fire-burning">
        <Grid cols="md:grid-cols-4">
          <SelectField label="Pool diameter from" value={f.diameterSource} options={DIAMETER_SOURCES} onChange={(v) => set({ diameterSource: v })} testId="diameter-source" />
          {f.diameterSource === 'pool' ? (
            <LinkedValue label="Pool diameter D" unit="m" value={e.diameter.error ? 'n/a' : formatSci(e.diameter.poolDiameterM, 5)} from="Source term: pool from a spill" testId="linked-diameter" />
          ) : (
            <NumField label="Pool diameter D" unit="m" value={f.poolDiameterM} onChange={(v) => set({ poolDiameterM: v })} error={refused(failed, 'poolDiameterM')} />
          )}
          <SelectField label="Burning rate method" value={f.burningMethod} options={BURNING_METHODS} onChange={(v) => set({ burningMethod: v })} testId="burning-method" />
          <NumField label="Heat of combustion" unit="MJ/kg" value={f.heatOfCombustionMJKg} onChange={(v) => set({ heatOfCombustionMJKg: v })} error={refused(failed, 'heatOfCombustionJKg')} />
        </Grid>
        {f.burningMethod === 'babrauskas' ? (
          <Grid cols="md:grid-cols-4">
            <label className="flex items-center gap-2 text-xs text-slate-300 md:col-span-4">
              <input type="checkbox" checked={f.customBurning} onChange={(ev) => set({ customBurning: ev.target.checked })} />
              Give the two coefficients myself instead of a Table 6.5 fuel
            </label>
            {f.customBurning ? (
              <>
                <NumField label='m"inf' unit="kg/(m2 s)" value={f.massBurningFluxInfKgM2S} onChange={(v) => set({ massBurningFluxInfKgM2S: v })} error={refused(failed, 'massBurningFluxInfKgM2S')} />
                <NumField label="k beta (none: independent of D)" unit="1/m" value={f.kBetaPerM} onChange={(v) => set({ kBetaPerM: v })} error={refused(failed, 'kBetaPerM')} />
              </>
            ) : (
              <SelectField label="Fuel (YB Table 6.5, Babrauskas 1983)" value={f.fuel} options={FUEL_OPTIONS} onChange={(v) => set({ fuel: v })} className="md:col-span-2" testId="fuel" />
            )}
          </Grid>
        ) : (
          <Grid cols="md:grid-cols-4">
            <NumField label="Heat of vaporisation" unit="MJ/kg" value={f.heatOfVaporisationMJKg} onChange={(v) => set({ heatOfVaporisationMJKg: v })} error={refused(failed, 'heatOfVaporisationJKg')} />
            <NumField label="Liquid heat capacity" unit="J/(kg K)" value={f.liquidHeatCapacityJKgK} onChange={(v) => set({ liquidHeatCapacityJKgK: v })} error={refused(failed, 'liquidHeatCapacityJKgK')} />
            <NumField label="Boiling point" unit="C" value={f.boilingPointC} onChange={(v) => set({ boilingPointC: v })} error={refused(failed, 'boilingPointK')} />
            <NumField label="Ambient temperature" unit="C" value={f.ambientTemperatureC} onChange={(v) => set({ ambientTemperatureC: v })} error={refused(failed, 'ambientTemperatureK')} />
          </Grid>
        )}
        {e.diameter.error ? <EngineError result={e.diameter} /> : (
          <Result result={e.burning}>
            <Grid cols="md:grid-cols-4">
              <Stat label="Burning flux m&quot;" unit="kg/(m2 s)" value={formatSci(e.burning.burningFluxKgM2S, 4)} emphasis testId="burning-flux" />
            </Grid>
          </Result>
        )}
      </Panel>

      <Panel title="Flame, emissive power and target" testId="fire-flame">
        <Grid cols="md:grid-cols-4">
          <SelectField label="Flame length" value={f.flameLengthMethod} options={FLAME_LENGTH_METHODS} onChange={(v) => set({ flameLengthMethod: v })} testId="flame-length-method" />
          <NumField label="Air density" unit="kg/m3" value={f.airDensityKgM3} onChange={(v) => set({ airDensityKgM3: v })} error={refused(failed, 'airDensityKgM3')} />
          <NumField label="Wind speed at 10 m (0: no tilt)" unit="m/s" value={f.windSpeed10mMS} onChange={(v) => set({ windSpeed10mMS: v })} error={refused(failed, 'windSpeed10mMS')} />
          <NumField label="Air kinematic viscosity (for tilt)" unit="m2/s" value={f.airKinematicViscosityM2S} onChange={(v) => set({ airKinematicViscosityM2S: v })} error={refused(failed, 'airKinematicViscosityM2S')} testId="viscosity-input" />
          <SelectField label="Surface emissive power" value={f.sepMethod} options={SEP_METHODS} onChange={(v) => set({ sepMethod: v })} testId="sep-method" />
          {f.sepMethod !== 'mudan-diameter' ? (
            <NumField label="Radiative fraction Fs (YB: 0.1 to 0.4)" unit="-" value={f.radiativeFraction} onChange={(v) => set({ radiativeFraction: v })} error={refused(failed, 'radiativeFraction')} />
          ) : null}
          {f.sepMethod === 'radiative-fraction-soot' ? (
            <>
              <NumField label="Soot fraction (YB: 0.8 for oil products)" unit="-" value={f.sootFraction} onChange={(v) => set({ sootFraction: v })} error={refused(failed, 'sootFraction')} />
              <NumField label="Soot emissive power (blank: 20)" unit="kW/m2" value={f.sootEmissivePowerKWM2} onChange={(v) => set({ sootEmissivePowerKWM2: v })} error={refused(failed, 'sootEmissivePowerWM2')} />
            </>
          ) : null}
          <NumField label="Target distance from the pool centre X" unit="m" value={f.distanceFromCentreM} onChange={(v) => set({ distanceFromCentreM: v })} error={refused(failed, 'distanceFromAxisM', 'distanceFromCentreM')} testId="fire-distance-input" />
          <SelectField label="Transmissivity" value={f.transmissivityMode} options={TRANSMISSIVITY_MODES} onChange={(v) => set({ transmissivityMode: v })} testId="tau-mode" />
          {f.transmissivityMode === 'given' ? (
            <NumField label="Transmissivity tau" unit="-" value={f.transmissivity} onChange={(v) => set({ transmissivity: v })} error={refused(failed, 'transmissivity')} testId="tau-input" />
          ) : (
            <NumField label="Water vapour partial pressure pw" unit="Pa" value={f.waterVapourPartialPressurePa} onChange={(v) => set({ waterVapourPartialPressurePa: v })} error={refused(failed, 'waterVapourPartialPressurePa', 'pathLengthM')} testId="pw-input" />
          )}
        </Grid>
        <Note>
          The opening values are the Yellow Book worked example 6.6.3 (benzene in a 1,415 m2 bund, wind 5 m/s,
          target 100 m from the centre, tau 0.71474 read from Hottel&apos;s charts), which prints 4,581 W/m2. The
          example uses an air viscosity of 7.5133e-6 m2/s &quot;for air at 15 C&quot;; air at 15 C is about 1.48e-5
          m2/s. The value enters the tilt as Re^0.117, about 8 percent on the tilt parameter. Use the physical
          value for your own study.
        </Note>
        {e.flame?.error && !e.burning?.error && !e.diameter?.error ? <EngineError result={e.flame} /> : null}
        {e.flame && !e.flame.error ? (
          <div className="space-y-2">
            <Grid cols="md:grid-cols-4">
              <Stat label="Heat flux at X" unit="kW/m2" value={kw(e.flame.heatFluxWM2)} emphasis testId="heat-flux" />
              <Stat label="Flame length L" unit="m" value={formatSci(e.flame.flameLengthM, 5)} testId="flame-length" />
              <Stat label="Tilt from vertical" unit="degrees" value={formatSci(e.flame.tiltDeg, 5)} testId="flame-tilt" />
              <Stat label="SEP" unit="kW/m2" value={kw(e.flame.surfaceEmissivePowerWM2)} testId="sep" />
              <Stat label="View factor Fmax (used)" unit="-" value={formatSci(e.flame.viewFactorMax, 4)} testId="view-factor" />
              <Stat label="View factor, vertical Fv" unit="-" value={formatSci(e.flame.viewFactorVertical, 4)} />
              <Stat label="View factor, horizontal Fh" unit="-" value={formatSci(e.flame.viewFactorHorizontal, 4)} />
              <Stat label="Transmissivity tau" unit="-" value={formatSci(e.flame.transmissivity, 5)} testId="tau" />
            </Grid>
            {e.bagster && !e.bagster.error ? (
              <Note>Bagster: pw x = {formatSci(e.bagster.waterVapourPathProductPaM)} N/m with x = X minus D/2, the path from the flame surface.</Note>
            ) : null}
            <Note>
              The heat flux uses Fmax, the vector sum of Fv and Fh (YB 6.A.18), which is the most exposed target
              orientation. The flame is a cylinder of radius D/2; wind elongation of the base (YB 6.18) is not
              applied, as in the example.
            </Note>
            <BasisList basis={e.flame.basis} />
          </div>
        ) : null}
      </Panel>
    </>
  );
};

const HeatFluxDistance = () => {
  const { study, evaluation, setSection } = useConsequenceStudio();
  const f = study.fire;
  const r = evaluation.fire.distance;
  const set = (patch) => setSection('fire', patch);
  return (
    <Panel title="Distance to a heat flux" testId="fire-distance">
      <Grid cols="md:grid-cols-4">
        <NumField label="Target heat flux" unit="kW/m2" value={f.targetHeatFluxKWM2} onChange={(v) => set({ targetHeatFluxKWM2: v })} error={refused(r, 'targetHeatFluxWM2')} testId="target-flux-input" />
        {f.transmissivityMode === 'bagster' ? (
          <NumField label="Fixed transmissivity for the search" unit="-" value={f.searchTransmissivity} onChange={(v) => set({ searchTransmissivity: v })} error={refused(r, 'transmissivity')} testId="search-tau-input" />
        ) : null}
      </Grid>
      <Note>
        The search needs a fixed transmissivity: Bagster&apos;s fit holds only for 1e4 &lt; pw x &lt; 1e5 N/m, and a
        search over distance would walk out of that band.
        {f.transmissivityMode === 'bagster' ? ' Give the value to hold for the search here.' : ' The transmissivity you gave above is used.'}
      </Note>
      {r ? (r.error ? <EngineError result={r} /> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={r.state} testId="fire-distance-state" />
            <span className="text-sm text-slate-200">{HEAT_DISTANCE_STATE_TEXT[r.state]}</span>
          </div>
          {r.state === 'REACHED' ? (
            <Grid cols="md:grid-cols-4">
              <Stat label="From the pool centre" unit="m" value={formatSci(r.distanceFromCentreM, 4)} emphasis testId="fire-distance-centre" />
              <Stat label="From the pool edge" unit="m" value={formatSci(r.distanceFromEdgeM, 4)} />
            </Grid>
          ) : null}
          {r.state === 'NOT_REACHED' ? (
            <Grid cols="md:grid-cols-4">
              <Stat label="Highest heat flux outside the flame" unit="kW/m2" value={kw(r.maxHeatFluxWM2)} />
            </Grid>
          ) : null}
          <BasisList basis={r.basis} />
        </div>
      )) : null}
    </Panel>
  );
};

const FirePanel = () => {
  const { study, evaluation } = useConsequenceStudio();
  const e = evaluation.fire;
  const target = Number(study.fire.targetHeatFluxKWM2);
  return (
    <div className="space-y-4">
      <FireInputs />
      <HeatFluxDistance />
      {e.series ? (
        <Panel title="Heat flux against distance from the pool centre" testId="fire-chart-panel">
          <ConsequenceChart
            testId="fire-chart"
            data={e.series.points}
            xKey="distanceM"
            series={[{ key: 'heatFluxKWM2', name: 'Solid flame heat flux (Fmax)' }]}
            xLabel="Distance from the pool centre (m)"
            yLabel="Heat flux (kW/m2)"
            logY
            targetY={Number.isFinite(target) && target > 0 ? target : undefined}
            targetLabel={`Target ${formatSci(target)} kW/m2`}
            markX={Number(study.fire.distanceFromCentreM)}
            markLabel="X"
          />
          <Note>
            Engine values at 80 distances from just outside the flame ({formatSci(e.series.reachM, 4)} m, the base
            radius plus the overhang of a tilted flame) outward.
            {e.series.refused > 0
              ? ` ${e.series.refused} of them were refused by the engine and are left as gaps (with Bagster, pw x outside 1e4 to 1e5 N/m).`
              : ''}
          </Note>
        </Panel>
      ) : null}
    </div>
  );
};

export default FirePanel;
