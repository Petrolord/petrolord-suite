// Harm (PS2): thermal, toxic and overpressure probits with named presets,
// and the probability of fatality each gives. Each dose can be carried over
// from the tab that computed it. Every number is the engine's.
import React from 'react';
import { useConsequenceStudio } from '@/contexts/ConsequenceStudioContext';
import {
  CONCENTRATION_UNITS, HARM_LINKS, OVERPRESSURE_PROBITS, THERMAL_PROBITS, TOXIC_PROBITS, UNIT,
  formatPercent, formatSci,
} from '@/utils/processSafety/consequenceStudy';
import {
  Grid, LinkedValue, Note, NumField, Panel, Result, SelectField, Stat, refused,
} from './fields';

const THERMAL_OPTIONS = Object.entries(THERMAL_PROBITS).map(([id, c]) => ({
  id, label: `${id}: Y = ${c.a} + ${c.b} ln(t I^(4/3)), I in ${c.intensityUnit}`,
}));
const TOXIC_OPTIONS = Object.entries(TOXIC_PROBITS).map(([id, c]) => ({
  id, label: `${id}: Y = ${c.a} + ${c.b} ln(C^${c.n} t), C in ${c.unit}, t in min`,
}));
const OVERPRESSURE_OPTIONS = Object.entries(OVERPRESSURE_PROBITS).map(([id, c]) => ({
  id, label: `${id}: Y = ${c.a} + ${c.b} ln(P), P in ${c.unit}`,
}));

/** The normal CDF the engine uses is good to 1.5e-7 absolute (FINDINGS section 5). */
const CDF_RESOLUTION = 1.5e-7;

const Outcome = ({ result, testId, extra }) => (
  <Result result={result}>
    <Grid cols="md:grid-cols-4">
      <Stat label="Probit Y" unit="-" value={formatSci(result.probit, 4)} testId={`${testId}-probit`} />
      <Stat label="Probability of fatality" value={formatPercent(result.probability)} emphasis testId={`${testId}-probability`} />
      {extra}
    </Grid>
    {result.probability < CDF_RESOLUTION ? (
      <Note>
        The probability is below 1.5e-7, the absolute accuracy of the normal CDF the engine uses (Abramowitz and
        Stegun 7.1.26). Read it as effectively zero.
      </Note>
    ) : null}
  </Result>
);

const Thermal = () => {
  const { study, evaluation, setPart } = useConsequenceStudio();
  const t = study.harm.thermal;
  const h = evaluation.harm;
  const set = (patch) => setPart('harm', 'thermal', patch);
  return (
    <Panel title="Thermal radiation" testId="harm-thermal">
      <Grid cols="md:grid-cols-4">
        <SelectField label="Preset" value={t.preset} options={THERMAL_OPTIONS} onChange={(v) => set({ preset: v })} className="md:col-span-2" testId="thermal-preset" />
        <SelectField label="Heat flux from" value={t.link} options={HARM_LINKS.thermal} onChange={(v) => set({ link: v })} />
        {t.link === 'fire' ? (
          <LinkedValue label="Heat flux I" unit="kW/m2" value={h.flux.error ? 'n/a' : formatSci(h.flux.heatFluxWM2 / UNIT.W_PER_KW)} from="Fire: heat flux at the target" testId="linked-heat-flux" />
        ) : (
          <NumField label="Heat flux I" unit="kW/m2" value={t.heatFluxKWM2} onChange={(v) => set({ heatFluxKWM2: v })} error={refused(h.thermal, 'heatFluxWM2')} testId="thermal-flux-input" />
        )}
        <NumField label="Exposure time t" unit="s" value={t.exposureTimeS} onChange={(v) => set({ exposureTimeS: v })} error={refused(h.thermal, 'exposureTimeS')} testId="thermal-time-input" />
      </Grid>
      <Outcome
        result={h.thermal}
        testId="thermal"
        extra={h.thermal && !h.thermal.error ? <Stat label="Dose V" unit={h.thermal.doseUnit} value={formatSci(h.thermal.dose, 4)} /> : null}
      />
      <Note>
        The presets are named by origin, because they differ. The Purple Book&apos;s -36.38 + 2.56 ln(Q^(4/3) t) with Q
        in W/m2 is Tsao and Perry, 2.1 probit units above Eisenberg; at the Eisenberg 50 percent dose it gives about
        98 percent. The OSD/30 Table 17 TNO row is left out because its printed lethal doses do not follow from its
        coefficients.
      </Note>
    </Panel>
  );
};

const Toxic = () => {
  const { study, evaluation, setPart } = useConsequenceStudio();
  const t = study.harm.toxic;
  const h = evaluation.harm;
  const set = (patch) => setPart('harm', 'toxic', patch);
  const linked = t.link !== 'typed';
  return (
    <Panel title="Toxic exposure" testId="harm-toxic">
      <Grid cols="md:grid-cols-4">
        <SelectField label="Preset" value={t.preset} options={TOXIC_OPTIONS} onChange={(v) => set({ preset: v })} className="md:col-span-2" testId="toxic-preset" />
        <SelectField label="Concentration from" value={t.link} options={HARM_LINKS.toxic} onChange={(v) => set({ link: v })} testId="toxic-link" />
        {linked ? (
          <LinkedValue
            label="Concentration C" unit="mg/m3"
            value={h.conc.error ? 'n/a' : formatSci(h.conc.concentrationMgM3)}
            from={t.link === 'dispersion-receptor' ? 'Dispersion: at the receptor' : 'Dispersion: centreline'}
            testId="linked-concentration"
          />
        ) : (
          <>
            <NumField label="Concentration C" unit={t.unit} value={t.concentration} onChange={(v) => set({ concentration: v })} error={refused(h.toxic, 'concentrationPpm', 'concentrationMgM3')} testId="toxic-concentration-input" />
            <SelectField label="Unit" value={t.unit} options={CONCENTRATION_UNITS} onChange={(v) => set({ unit: v })} />
            <NumField label="Molar mass, if the unit differs from the preset's" unit="g/mol" value={t.molarMassGMol} onChange={(v) => set({ molarMassGMol: v })} error={refused(h.toxic, 'molarMassGMol')} />
          </>
        )}
        <NumField label="Exposure time t" unit="min" value={t.exposureMinutes} onChange={(v) => set({ exposureMinutes: v })} error={refused(h.toxic, 'exposureMinutes')} testId="toxic-time-input" />
      </Grid>
      {linked ? (
        <Note>
          A carried over concentration is converted to the preset&apos;s unit by the engine with the Dispersion tab&apos;s molar
          mass, air temperature and pressure. The dose is C^n t at a constant concentration: the plume is steady, so
          the exposure time is yours.
        </Note>
      ) : null}
      <Outcome
        result={h.toxic}
        testId="toxic"
        extra={h.toxic && !h.toxic.error ? (
          <>
            <Stat label="C in the preset's unit" value={formatSci(h.toxic.concentrationInPresetUnit)} />
            <Stat label="Dose" unit={h.toxic.doseUnit} value={formatSci(h.toxic.dose, 4)} />
          </>
        ) : null}
      />
      <Note>
        Presets: the Purple Book Table 5.2 (pb-, mg/m3 and minutes) and Lees (2005) as UK HSE OSD/30 Table 2 prints
        them (lees-, ppm and minutes), each kept only where the source&apos;s own LC1 and LC50 columns reproduce.
      </Note>
    </Panel>
  );
};

const Overpressure = () => {
  const { study, evaluation, setPart } = useConsequenceStudio();
  const o = study.harm.overpressure;
  const h = evaluation.harm;
  const set = (patch) => setPart('harm', 'overpressure', patch);
  return (
    <Panel title="Blast overpressure" testId="harm-overpressure">
      <Grid cols="md:grid-cols-4">
        <SelectField label="Preset" value={o.preset} options={OVERPRESSURE_OPTIONS} onChange={(v) => set({ preset: v })} className="md:col-span-2" />
        <SelectField label="Overpressure from" value={o.link} options={HARM_LINKS.overpressure} onChange={(v) => set({ link: v })} />
        {o.link === 'explosion' ? (
          <LinkedValue label="Overpressure P" unit="kPa" value={h.op.error ? 'n/a' : formatSci(h.op.overpressurePa / UNIT.PA_PER_KPA)} from="Explosion: at distance R" testId="linked-overpressure" />
        ) : (
          <NumField label="Overpressure P" unit="kPa" value={o.overpressureKPa} onChange={(v) => set({ overpressureKPa: v })} error={refused(h.overpressure, 'overpressurePa')} />
        )}
      </Grid>
      <Outcome
        result={h.overpressure}
        testId="overpressure-harm"
        extra={h.overpressure && !h.overpressure.error ? <Stat label="P in the preset's unit" value={formatSci(h.overpressure.overpressureInPresetUnit, 4)} /> : null}
      />
      <Note>
        The HSC road and rail probit (UK HSE OSD/30 Equation 4a) takes P in psig. The lung haemorrhage and eardrum
        probits often quoted from the TNO Green Book are left out: their source could not be read.
      </Note>
    </Panel>
  );
};

const HarmPanel = () => (
  <div className="space-y-4">
    <Note>
      A probit Y turns a dose into a probability, P = Phi(Y - 5) (Purple Book 5.1, Table 5.1). Every coefficient
      comes from a named preset; the source of each is printed under its result.
    </Note>
    <Thermal />
    <Toxic />
    <Overpressure />
  </div>
);

export default HarmPanel;
