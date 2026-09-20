// Explosion (PS2): TNT equivalence, Hopkinson-Cranz scaled distance and the
// Kinney and Graham free-air peak side-on overpressure, with a curve against
// distance and the distance to an overpressure. Every number is the engine's.
import React from 'react';
import { useConsequenceStudio } from '@/contexts/ConsequenceStudioContext';
import {
  CHARGE_MODES, KINNEY_GRAHAM_Z_RANGE, UNIT, formatSci,
} from '@/utils/processSafety/consequenceStudy';
import ConsequenceChart from './ConsequenceChart';
import {
  BasisList, EngineError, Grid, Note, NumField, Panel, Result, SelectField, Stat, refused,
} from './fields';

const kpa = (pa) => formatSci(pa / UNIT.PA_PER_KPA);

const ExplosionPanel = () => {
  const { study, evaluation, setSection } = useConsequenceStudio();
  const x = study.explosion;
  const e = evaluation.explosion;
  const set = (patch) => setSection('explosion', patch);
  const failed = [e.tnt, e.overpressure].find((r) => r?.error);
  const target = Number(x.targetOverpressureKPa);
  return (
    <div className="space-y-4">
      <Panel title="Charge" testId="explosion-charge">
        <Grid cols="md:grid-cols-4">
          <SelectField label="Charge" value={x.chargeMode} options={CHARGE_MODES} onChange={(v) => set({ chargeMode: v })} testId="charge-mode" />
          {x.chargeMode === 'fuel' ? (
            <>
              <NumField label="Fuel mass in the cloud" unit="kg" value={x.fuelMassKg} onChange={(v) => set({ fuelMassKg: v })} error={refused(e.tnt, 'fuelMassKg')} />
              <NumField label="Heat of combustion" unit="MJ/kg" value={x.heatOfCombustionMJKg} onChange={(v) => set({ heatOfCombustionMJKg: v })} error={refused(e.tnt, 'heatOfCombustionJKg')} />
              <NumField label="Yield factor (YB: 0.02 to 0.2 in use)" unit="-" value={x.yieldFactor} onChange={(v) => set({ yieldFactor: v })} error={refused(e.tnt, 'yieldFactor')} />
              <NumField label="TNT blast energy" unit="MJ/kg" value={x.tntBlastEnergyMJKg} onChange={(v) => set({ tntBlastEnergyMJKg: v })} error={refused(e.tnt, 'tntBlastEnergyJKg')} testId="tnt-energy-input" />
            </>
          ) : (
            <NumField label="TNT mass" unit="kg" value={x.tntMassKg} onChange={(v) => set({ tntMassKg: v })} error={refused(e.tnt, 'tntMassKg')} />
          )}
        </Grid>
        {x.chargeMode === 'fuel' ? (
          <Note>
            The TNT blast energy is yours to state. The Yellow Book cites 4.19 to 4.65 MJ/kg in use and other texts
            use 4.68 to 4.69; the engine refuses a value outside 4.0 to 5.0 MJ/kg as a units slip. The opening
            charge (1,000 kg, 46 MJ/kg, yield 0.03, 4.68 MJ/kg) is illustrative.
          </Note>
        ) : null}
        <Result result={e.tnt}>
          <Grid cols="md:grid-cols-4">
            <Stat label="TNT equivalent mass W" unit="kg" value={formatSci(e.tnt.tntMassKg, 4)} emphasis testId="tnt-mass" />
          </Grid>
        </Result>
      </Panel>

      {!e.tnt.error ? (
        <Panel title="Overpressure at a distance (free-air burst)" testId="explosion-overpressure">
          <Grid cols="md:grid-cols-4">
            <NumField label="Distance R" unit="m" value={x.distanceM} onChange={(v) => set({ distanceM: v })} error={refused(failed, 'distanceM', 'scaledDistanceMKg13')} testId="blast-distance-input" />
            <NumField label="Ambient pressure" unit="bar absolute" value={x.ambientPressureBar} onChange={(v) => set({ ambientPressureBar: v })} error={refused(failed, 'ambientPressurePa')} />
          </Grid>
          <Result result={e.overpressure}>
            <Grid cols="md:grid-cols-4">
              <Stat label="Peak side-on overpressure" unit="kPa" value={kpa(e.overpressure.overpressurePa)} emphasis testId="overpressure" />
              <Stat label="Scaled distance Z = R / W^(1/3)" unit="m/kg^(1/3)" value={formatSci(e.overpressure.scaledDistanceMKg13, 4)} testId="scaled-distance" />
              <Stat label="ps / pa" unit="-" value={formatSci(e.overpressure.overpressureRatio, 4)} />
            </Grid>
          </Result>
          <Note>
            The Kinney and Graham fit is used over Z = {KINNEY_GRAHAM_Z_RANGE.min} to {KINNEY_GRAHAM_Z_RANGE.max} m/kg^(1/3)
            and refused outside it. That range is a judgement: the fit&apos;s own range was not available, so the span of
            the Kingery-Bulmash TNT compilation is borrowed. Glass breakage (about Z 50 to 80) needs another method. A
            surface (hemispherical) burst is outside the model; allow for it, if you need to, in the charge you give.
          </Note>
        </Panel>
      ) : null}

      {!e.tnt.error ? (
        <Panel title="Distance to an overpressure" testId="explosion-distance">
          <Grid cols="md:grid-cols-4">
            <NumField label="Target overpressure" unit="kPa" value={x.targetOverpressureKPa} onChange={(v) => set({ targetOverpressureKPa: v })} error={refused(e.distance, 'overpressurePa')} testId="target-overpressure-input" />
          </Grid>
          {e.distance?.error ? <EngineError result={e.distance} /> : null}
          {e.distance && !e.distance.error ? (
            <div className="space-y-2">
              <Grid cols="md:grid-cols-4">
                <Stat label="Distance" unit="m" value={formatSci(e.distance.distanceM, 4)} emphasis testId="blast-distance" />
                <Stat label="Scaled distance Z" unit="m/kg^(1/3)" value={formatSci(e.distance.scaledDistanceMKg13, 4)} />
              </Grid>
              <BasisList basis={e.distance.basis} />
            </div>
          ) : null}
        </Panel>
      ) : null}

      {e.series ? (
        <Panel title="Overpressure against distance" testId="explosion-chart-panel">
          <ConsequenceChart
            testId="explosion-chart"
            data={e.series}
            xKey="distanceM"
            series={[{ key: 'overpressureKPa', name: 'Kinney and Graham, free air' }]}
            xLabel="Distance (m)"
            yLabel="Peak side-on overpressure (kPa)"
            logX
            logY
            targetY={Number.isFinite(target) && target > 0 ? target : undefined}
            targetLabel={`Target ${formatSci(target)} kPa`}
            markX={Number(x.distanceM)}
            markLabel="R"
          />
          <Note>Engine values at 70 scaled distances across the fit&apos;s range, drawn at R = Z W^(1/3).</Note>
        </Panel>
      ) : null}
    </div>
  );
};

export default ExplosionPanel;
