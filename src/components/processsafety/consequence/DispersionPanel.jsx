// Dispersion (PS2): the continuous Gaussian plume with ground reflection,
// Briggs rural sigmas or sigmas you give, the concentration at a point in
// mg/m3 and ppm, and the distance at which it falls to a target.
import React from 'react';
import { useConsequenceStudio } from '@/contexts/ConsequenceStudioContext';
import {
  CONCENTRATION_UNITS, DISTANCE_STATE_TEXT, PLUME_RATE_SOURCES, SIGMA_MODES, STABILITY_CLASSES,
  formatSci, toPpm,
} from '@/utils/processSafety/consequenceStudy';
import ConsequenceChart from './ConsequenceChart';
import {
  BasisList, EngineError, Grid, LinkedValue, Note, NumField, Panel, Result, SelectField, Stat,
  StateBadge, refused,
} from './fields';

const RATE_FROM = { evaporation: 'Source term: pool evaporation', 'gas-release': 'Source term: gas release' };

const Concentration = ({ label, result, testId }) => (
  <Result result={result}>
    <Grid cols="md:grid-cols-4">
      <Stat label={`${label}`} unit="mg/m3" value={formatSci(result.concentrationMgM3)} emphasis testId={`${testId}-mg`} />
      <Stat label={`${label}`} unit="ppm" value={Number.isFinite(result.concentrationPpm) ? formatSci(result.concentrationPpm) : 'n/a (give a molar mass)'} testId={`${testId}-ppm`} />
      <Stat label="sigma y" unit="m" value={formatSci(result.sigmaYM)} />
      <Stat label="sigma z" unit="m" value={formatSci(result.sigmaZM)} />
    </Grid>
  </Result>
);

const DistanceToConcentration = () => {
  const { study, evaluation, setSection } = useConsequenceStudio();
  const d = study.dispersion;
  const r = evaluation.dispersion.distance;
  const set = (patch) => setSection('dispersion', patch);
  return (
    <Panel title="Distance to a concentration (centreline, at the receptor height)" testId="plume-distance">
      <Grid cols="md:grid-cols-4">
        <NumField label="Target concentration" unit={d.targetUnit} value={d.targetConcentration} onChange={(v) => set({ targetConcentration: v })} error={refused(r, 'targetConcentrationMgM3', 'concentrationPpm', 'concentrationMgM3')} testId="target-concentration-input" />
        <SelectField label="Target unit" value={d.targetUnit} options={CONCENTRATION_UNITS} onChange={(v) => set({ targetUnit: v })} />
      </Grid>
      {r?.unavailable ? <Note>{r.message}</Note> : null}
      {r && !r.unavailable ? (
        r.error ? <EngineError result={r} /> : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge state={r.state} testId="plume-distance-state" />
              <span className="text-sm text-slate-200">{DISTANCE_STATE_TEXT[r.state]}</span>
            </div>
            <Grid cols="md:grid-cols-4">
              <Stat label="Near root" unit="m" value={r.nearDistanceM === null ? 'none' : formatSci(r.nearDistanceM)} testId="plume-near" />
              <Stat label="Far root" unit="m" value={r.farDistanceM === null ? 'none' : formatSci(r.farDistanceM)} emphasis testId="plume-far" />
              <Stat label="Peak concentration" unit="mg/m3" value={formatSci(r.peakConcentrationMgM3)} />
              <Stat label="Peak at" unit="m" value={formatSci(r.peakDistanceM)} />
            </Grid>
            <Note>
              A release at ground level falls away from the source, so it has one root (the far one). An
              elevated release rises to a peak and falls, so it can have two: inside the near root and beyond
              the far root the concentration is below the target. The search runs from 1 m to 100 km.
            </Note>
            <BasisList basis={r.basis} />
          </div>
        )
      ) : null}
    </Panel>
  );
};

const DispersionPanel = () => {
  const { study, evaluation, setSection } = useConsequenceStudio();
  const d = study.dispersion;
  const e = evaluation.dispersion;
  const set = (patch) => setSection('dispersion', patch);
  const first = [e.centreline, e.receptor].find((r) => r?.error);
  const chartData = (e.series || []).map((p) => ({ distanceM: p.distanceM, mg: p.concentrationMgM3 }));
  const targetMg = e.distance && !e.distance.error && !e.distance.unavailable ? e.distance.targetConcentrationMgM3 : undefined;
  return (
    <div className="space-y-4">
      <Panel title="Release and weather" testId="plume-inputs">
        <Grid cols="md:grid-cols-4">
          <SelectField label="Release rate from" value={d.rateSource} options={PLUME_RATE_SOURCES} onChange={(v) => set({ rateSource: v })} testId="rate-source" />
          {d.rateSource === 'typed' ? (
            <NumField label="Release rate Q" unit="kg/s" value={d.massRateKgS} onChange={(v) => set({ massRateKgS: v })} error={refused(first, 'massRateKgS')} />
          ) : (
            <LinkedValue label="Release rate Q" unit="kg/s" value={e.rate.error ? 'n/a' : formatSci(e.rate.massRateKgS)} from={RATE_FROM[d.rateSource]} testId="linked-rate" />
          )}
          <NumField label="Wind speed" unit="m/s" value={d.windSpeedMS} onChange={(v) => set({ windSpeedMS: v })} error={refused(first, 'windSpeedMS')} />
          <SelectField label="Dispersion coefficients" value={d.sigmaMode} options={SIGMA_MODES} onChange={(v) => set({ sigmaMode: v })} testId="sigma-mode" />
          {d.sigmaMode === 'user' ? (
            <>
              <NumField label="sigma y" unit="m" value={d.sigmaYM} onChange={(v) => set({ sigmaYM: v })} error={refused(first, 'sigmaYM')} testId="sigma-y-input" />
              <NumField label="sigma z" unit="m" value={d.sigmaZM} onChange={(v) => set({ sigmaZM: v })} error={refused(first, 'sigmaZM')} testId="sigma-z-input" />
            </>
          ) : (
            <SelectField label="Pasquill-Gifford stability class" value={d.stabilityClass} options={STABILITY_CLASSES.map((c) => c)} onChange={(v) => set({ stabilityClass: v })} testId="stability-class" />
          )}
          <NumField label="Release height h" unit="m" value={d.releaseHeightM} onChange={(v) => set({ releaseHeightM: v })} error={refused(first, 'releaseHeightM')} testId="release-height-input" />
        </Grid>
      </Panel>

      <Panel title="Receptor" testId="plume-receptor">
        <Grid cols="md:grid-cols-4">
          <NumField label="Downwind distance x" unit="m" value={d.downwindDistanceM} onChange={(v) => set({ downwindDistanceM: v })} error={refused(first, 'downwindDistanceM')} testId="downwind-input" />
          <NumField label="Crosswind offset y" unit="m" value={d.crosswindDistanceM} onChange={(v) => set({ crosswindDistanceM: v })} error={refused(first, 'crosswindDistanceM')} />
          <NumField label="Receptor height z" unit="m" value={d.receptorHeightM} onChange={(v) => set({ receptorHeightM: v })} error={refused(first, 'receptorHeightM')} />
          <NumField label="Molar mass, for ppm (blank: mg/m3 only)" unit="g/mol" value={d.molarMassGMol} onChange={(v) => set({ molarMassGMol: v })} error={refused(first, 'molarMassGMol')} />
          <NumField label="Air temperature, for ppm" unit="C" value={d.temperatureC} onChange={(v) => set({ temperatureC: v })} error={refused(first, 'temperatureK')} />
          <NumField label="Air pressure, for ppm" unit="bar absolute" value={d.pressureBar} onChange={(v) => set({ pressureBar: v })} error={refused(first, 'pressurePa')} />
        </Grid>
        {e.rate.error ? <EngineError result={e.rate} /> : null}
        <h4 className="pt-1 text-xs font-semibold text-slate-300">On the centreline (y = 0) at x and z</h4>
        <Concentration label="Centreline concentration" result={e.centreline} testId="centreline" />
        <h4 className="pt-1 text-xs font-semibold text-slate-300">At the receptor (x, y, z)</h4>
        <Concentration label="Receptor concentration" result={e.receptor} testId="receptor" />
        <Note>
          ppm is by volume, converted by the ideal gas molar volume R T / P at the air temperature and pressure
          above (24.465 L/mol at 25 C and 1 atm; the CCOHS 24.45 is its rounding).
        </Note>
      </Panel>

      <DistanceToConcentration />

      {e.series ? (
        <Panel title="Centreline concentration against downwind distance" testId="plume-chart-panel">
          <ConsequenceChart
            testId="plume-chart"
            data={chartData}
            xKey="distanceM"
            series={[{ key: 'mg', name: `Centreline at z = ${d.receptorHeightM || 0} m, class ${d.stabilityClass}` }]}
            xLabel="Downwind distance (m)"
            yLabel="Concentration (mg/m3)"
            logX
            logY
            targetY={targetMg}
            targetLabel={`Target ${formatSci(targetMg)} mg/m3`}
            markX={Number(d.downwindDistanceM)}
            markLabel="x"
          />
          <Note>
            Engine values at 70 distances from 10 m to 20 km. The Briggs curves are usually quoted for 100 m to
            10 km; outside that the engine warns and the curve is an extrapolation.
            {Number.isFinite(targetMg) ? ` Target ${formatSci(targetMg)} mg/m3${toPpm(targetMg, d) !== null ? ` (${formatSci(toPpm(targetMg, d))} ppm)` : ''}.` : ''}
          </Note>
        </Panel>
      ) : (
        d.sigmaMode === 'user' ? (
          <Note>
            With sigmas you give, the plume is known at one distance only, so no curve against distance is drawn.
          </Note>
        ) : null
      )}
    </div>
  );
};

export default DispersionPanel;
