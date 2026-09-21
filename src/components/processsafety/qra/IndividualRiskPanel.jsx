// Individual risk (PS3): the location specific individual risk (LSIR) of
// every location with its contributions, ALARP band and Purple Book contour;
// the individual risk per annum (IRPA) of the most exposed person; a chart of
// both against the ALARP bands; and LSIR along a transect with the distances
// at which it crosses the Purple Book contours.
import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQraStudio } from '@/contexts/QraStudioContext';
import {
  BAND_TEXT, IR_CRITERIA, THERMAL_PRESET_CHOICES, TRANSECT_MODES,
  criterionLimits, formatPercent, formatSci, newId, oneIn, scenarioLabel,
} from '@/utils/processSafety/qraStudy';
import {
  EngineError, Grid, Note, NumField, Panel, Refusal, RemoveButton, Result, SelectField, Stat, StateBadge, TextField,
  refused,
} from './fields';
import { IrBandChart, TransectChart } from './QraCharts';

const contourText = (c) => (c === null || c === undefined ? 'outside 1e-8' : `inside ${formatSci(c, 1)}`);

const LocationTable = () => {
  const { evaluation } = useQraStudio();
  const rows = evaluation.register.locations;
  return (
    <Panel title="Location specific individual risk (LSIR)" testId="lsir-table">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-1 pr-2">Location</th>
              <th className="py-1 pr-2 text-right">LSIR (per year)</th>
              <th className="py-1 pr-2">As R2P2 words it</th>
              <th className="py-1 pr-2">Purple Book contour (studio reading)</th>
              <th className="py-1 pr-2">ALARP band</th>
              <th className="py-1">Largest contributor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, j) => {
              if (r.lsir.error) {
                return (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="py-1 pr-2 text-slate-300">{r.label}</td>
                    <td colSpan={5} className="py-1"><Refusal result={r.lsir} /></td>
                  </tr>
                );
              }
              const top = [...r.lsir.contributions].sort((a, b) => b.contributionPerYr - a.contributionPerYr)[0];
              return (
                <tr key={r.id} className="border-t border-slate-800" data-testid={`lsir-row-${j}`}>
                  <td className="py-1 pr-2 text-slate-300">{r.label}</td>
                  <td className="py-1 pr-2 text-right font-mono text-white" data-testid={`lsir-${j}`}>{formatSci(r.lsir.lsirPerYr, 4)}</td>
                  <td className="py-1 pr-2 font-mono text-slate-300">{oneIn(r.lsir.lsirPerYr)}</td>
                  <td className="py-1 pr-2 text-slate-300" data-testid={`contour-${j}`}>{contourText(r.contour)}</td>
                  <td className="py-1 pr-2">
                    {r.band?.error ? <EngineError result={r.band} /> : <StateBadge state={r.band?.band} testId={`band-${j}`} />}
                    {r.band?.atBoundary ? <div className="text-[10px] text-amber-200">at the {r.band.atBoundary} limit</div> : null}
                  </td>
                  <td className="py-1 text-slate-300">
                    {top && top.contributionPerYr > 0 ? `${top.name} (${formatPercent(top.fraction)})` : 'none'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Note>
        LSIR = sum over the scenarios of f x Pd (Purple Book 6.1, 6.2): the risk to a person standing there all year,
        outdoors and unprotected. The contour column names the smallest Purple Book level (1e-4 to 1e-8 per year) the
        LSIR is at or above, which is a comparison the studio makes with the engine&apos;s list. A value exactly at a band
        limit belongs to the lower band.
      </Note>
    </Panel>
  );
};

const Irpa = () => {
  const { study, evaluation, setSection } = useQraStudio();
  const { irpa, irpaBand, irpaContour } = evaluation.individual;
  const ind = study.individual;
  return (
    <Panel title="Individual risk per annum (IRPA) of the most exposed person" testId="irpa">
      <Grid cols="md:grid-cols-4">
        <SelectField
          label="Judged against" value={ind.irpaCriterion} options={IR_CRITERIA}
          onChange={(v) => setSection('individual', { irpaCriterion: v })} className="md:col-span-2" testId="irpa-criterion"
        />
        <NumField
          label="Custom upper limit" unit="per year" value={ind.customUpperPerYr}
          onChange={(v) => setSection('individual', { customUpperPerYr: v })}
          error={refused(irpaBand, 'thresholds.unacceptableAbovePerYr')}
        />
        <NumField
          label="Custom lower limit" unit="per year" value={ind.customLowerPerYr}
          onChange={(v) => setSection('individual', { customLowerPerYr: v })}
          error={refused(irpaBand, 'thresholds.broadlyAcceptableAtOrBelowPerYr')}
        />
      </Grid>
      <Result result={irpa}>
        <Grid cols="md:grid-cols-4">
          <Stat label="IRPA" unit="per year" value={formatSci(irpa?.irpaPerYr, 4)} emphasis testId="irpa-value" />
          <Stat label="As R2P2 words it" value={oneIn(irpa?.irpaPerYr)} />
          <Stat label="Fraction of the year on site" value={formatPercent(irpa?.totalOccupancyFraction)} testId="irpa-occupancy" />
          <Stat label="Purple Book contour (studio reading)" value={contourText(irpaContour)} />
        </Grid>
        {irpaBand ? (
          irpaBand.error ? <EngineError result={irpaBand} /> : (
            <div className="space-y-1" data-testid="irpa-verdict">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-300">ALARP band</span>
                <StateBadge state={irpaBand.band} testId="irpa-band" />
                {irpaBand.atBoundary ? <span className="text-xs text-amber-200">at the {irpaBand.atBoundary} limit</span> : null}
              </div>
              <p className="text-xs text-slate-300">{BAND_TEXT[irpaBand.band]}</p>
              <p className="text-[11px] text-slate-400">
                {formatSci(irpaBand.ratioToUnacceptable, 3)} of the upper limit; {formatSci(irpaBand.ratioToBroadlyAcceptable, 3)} times
                the lower limit. Source: {irpaBand.basis.source}.
              </p>
            </div>
          )
        ) : null}
      </Result>
      <Note>
        IRPA = sum over the locations of LSIR x occupancy x vulnerability (occupancy is hours / 8,760). R2P2 gives 1 in
        1,000 a year for workers and 1 in 10,000 for the public as the upper limit and 1 in a million for both as the
        broadly acceptable boundary (paras 130, 132).
      </Note>
    </Panel>
  );
};

const BandChart = () => {
  const { study, evaluation, setSection } = useQraStudio();
  const crit = study.individual.chartCriterion;
  const limits = criterionLimits(crit, study.individual);
  const points = [];
  study.locations.forEach((l, j) => {
    const r = evaluation.register.locations[j];
    if (l.criterion === crit && r && !r.lsir.error) points.push({ label: r.label, ir: r.lsir.lsirPerYr });
  });
  const { irpa } = evaluation.individual;
  if (study.individual.irpaCriterion === crit && irpa && !irpa.error) points.push({ label: 'IRPA', ir: irpa.irpaPerYr });
  return (
    <Panel title="Individual risk against the ALARP bands" testId="band-chart-panel">
      <Grid cols="md:grid-cols-3">
        <SelectField
          label="Bands drawn for" value={crit} options={IR_CRITERIA}
          onChange={(v) => setSection('individual', { chartCriterion: v })} className="md:col-span-2" testId="chart-criterion"
        />
      </Grid>
      {limits.error ? <EngineError result={limits} /> : (
        <>
          {points.length > 0 ? <IrBandChart points={points} limits={limits} /> : (
            <Note>No location or IRPA is judged against this criterion.</Note>
          )}
          <p className="text-[11px] text-slate-400">
            Upper limit {formatSci(limits.unacceptableAbovePerYr)} per year, lower limit {formatSci(limits.broadlyAcceptableAtOrBelowPerYr)} per
            year ({limits.source}). Only the locations judged against this criterion are drawn, and the IRPA when it is.
          </p>
        </>
      )}
    </Panel>
  );
};

const Transect = () => {
  const {
    study, evaluation, setSection, updateListItem, addListItem, removeListItem,
  } = useQraStudio();
  const tr = study.transect;
  const { result, rows } = evaluation.transect;
  const scenarioOptions = study.scenarios.map((s, i) => ({ id: s.id, label: scenarioLabel(s, i) }));
  const add = () => addListItem('transect', 'rows', {
    id: newId('t'), scenarioId: study.scenarios[0]?.id || '', mode: 'typed', values: '', exposureTimeS: '', coefficients: 'eisenberg',
  });
  return (
    <Panel title="Individual risk contours along a transect" testId="transect">
      <TextField
        label="Distances from the source (m), increasing, comma separated" value={tr.distancesM}
        onChange={(v) => setSection('transect', { distancesM: v })}
      />
      <div className="space-y-2">
        {tr.rows.map((row, k) => {
          const set = (patch) => updateListItem('transect', 'rows', row.id, patch);
          const r = rows[k];
          return (
            <div key={row.id} className="rounded border border-slate-800 p-2" data-testid={`transect-row-${k}`}>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                <SelectField label="Scenario (its frequency from the register)" value={row.scenarioId} options={[{ id: '', label: 'Choose' }, ...scenarioOptions]} onChange={(v) => set({ scenarioId: v })} />
                <SelectField label="Along the transect" value={row.mode} options={TRANSECT_MODES} onChange={(v) => set({ mode: v })} testId={`transect-row-${k}-mode`} />
                <div className="flex items-end"><RemoveButton label="Remove this transect row" onClick={() => removeListItem('transect', 'rows', row.id)} /></div>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                <TextField
                  label={row.mode === 'thermal' ? 'Heat flux at each distance (kW/m2)' : 'Probability of death at each distance'}
                  value={row.values} onChange={(v) => set({ values: v })} className="md:col-span-2"
                />
                {row.mode === 'thermal' ? (
                  <>
                    <NumField label="Exposure time" unit="s" value={row.exposureTimeS} onChange={(v) => set({ exposureTimeS: v })} error={refused(r?.refusal, 'exposureTimeS')} />
                    <SelectField label="Thermal probit" value={row.coefficients} options={THERMAL_PRESET_CHOICES} onChange={(v) => set({ coefficients: v })} />
                  </>
                ) : null}
              </div>
              {r?.thermal ? (
                <p className="mt-1 font-mono text-[11px] text-slate-400">
                  Pd: {r.probabilities.map((p) => formatSci(p, 3)).join(', ')}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={add} className="border-slate-700 bg-slate-900 text-slate-200">
        <Plus className="mr-1 h-4 w-4" /> Add a scenario to the transect
      </Button>
      <Result result={result}>
        {result && !result.error ? (
          <>
            <TransectChart distancesM={evaluation.transect.distancesM} lsirPerYr={result.lsirPerYr} levels={result.contours.map((c) => c.levelPerYr)} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="contour-table">
                <thead className="text-left text-slate-400">
                  <tr><th className="py-1 pr-3">Contour (per year)</th><th className="py-1">Crossed at (m)</th></tr>
                </thead>
                <tbody className="font-mono text-slate-200">
                  {result.contours.map((c) => (
                    <tr key={c.levelPerYr} className="border-t border-slate-800">
                      <td className="py-1 pr-3">{formatSci(c.levelPerYr, 1)}</td>
                      <td className="py-1" data-testid={`contour-crossing-${formatSci(c.levelPerYr, 1)}`}>
                        {c.crossingsM.length ? c.crossingsM.map((x) => formatSci(x, 4)).join(', ') : 'not crossed in the transect'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Result>
      <Note>
        LSIR(x) = sum f x P(x) over the scenarios on the transect; a crossing is interpolated in log10(IR) between the two
        distances either side of it (linearly in IR when one side is 0). Heat fluxes turn into a probability by the thermal
        probit of the Consequence Modelling Studio&apos;s engine; you bring the fluxes from its Fire tab.
      </Note>
    </Panel>
  );
};

const IndividualRiskPanel = () => (
  <div className="space-y-4">
    <LocationTable />
    <Irpa />
    <BandChart />
    <Transect />
  </div>
);

export default IndividualRiskPanel;
