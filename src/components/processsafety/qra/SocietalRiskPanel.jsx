// Societal risk (PS3): potential loss of life, the fatal accident rate, and
// the F-N curve against a criterion line or point.
import React from 'react';
import { useQraStudio } from '@/contexts/QraStudioContext';
import {
  FN_CRITERION_CHOICES, FN_STATE_TEXT, criterionLine, fnCriterionSpec, fnStaircase, formatSci,
} from '@/utils/processSafety/qraStudy';
import {
  Grid, Note, NumField, Panel, Refusal, Result, SelectField, Stat, StateBadge, refused,
} from './fields';
import { FnChart } from './QraCharts';

const Pll = () => {
  const { study, evaluation, setSection } = useQraStudio();
  const { pll, far } = evaluation.societal;
  return (
    <Panel title="Potential loss of life and FAR" testId="pll">
      <Result result={pll}>
        <Grid cols="md:grid-cols-4">
          <Stat label="PLL" unit="deaths per year" value={formatSci(pll?.pllPerYr, 4)} emphasis testId="pll-value" />
          <Stat
            label="One death in"
            unit="years"
            value={pll && pll.pllPerYr > 0 ? formatSci(1 / pll.pllPerYr, 3) : 'n/a'}
          />
        </Grid>
        {pll && !pll.error ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-slate-400">
                <tr><th className="py-1 pr-3">Scenario</th><th className="py-1 text-right">f x N (deaths per year)</th></tr>
              </thead>
              <tbody className="font-mono text-slate-200">
                {pll.contributions.map((c) => (
                  <tr key={c.name} className="border-t border-slate-800">
                    <td className="py-1 pr-3 font-sans text-slate-300">{c.name}</td>
                    <td className="py-1 text-right">{formatSci(c.pllPerYr, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Result>
      <Grid cols="md:grid-cols-4">
        <NumField
          label="Exposed hours of the workforce" unit="h per year" value={study.societal.exposedHoursPerYr}
          onChange={(v) => setSection('societal', { exposedHoursPerYr: v })} error={refused(far, 'exposedHoursPerYr')}
          testId="exposed-hours-input"
        />
      </Grid>
      <Result result={far}>
        <Grid cols="md:grid-cols-4">
          <Stat label="FAR" unit="deaths per 1e8 exposed hours" value={formatSci(far?.far, 4)} emphasis testId="far-value" />
        </Grid>
      </Result>
      <Note>
        PLL = sum f x N, the expected deaths per year of every scenario in the register, public and workforce alike. FAR =
        PLL x 100,000,000 / exposed hours, on the IOGP base; give the hours of the people the PLL counts.
      </Note>
    </Panel>
  );
};

const FnCurve = () => {
  const { study, evaluation, setSection } = useQraStudio();
  const soc = study.societal;
  const { curve, comparison } = evaluation.societal;
  const set = (patch) => setSection('societal', patch);
  const spec = fnCriterionSpec(soc);
  const staircase = curve && !curve.error ? fnStaircase(curve.points) : [];
  const nHi = Math.max(1000, ...staircase.map((p) => p.n * 10));
  const drawn = comparison && !comparison.error ? criterionLine(spec, 1, nHi) : {};
  return (
    <Panel title="F-N curve" testId="fn">
      <Grid cols="md:grid-cols-4">
        <SelectField label="Criterion" value={soc.criterion} options={FN_CRITERION_CHOICES} onChange={(v) => set({ criterion: v })} className="md:col-span-2" testId="fn-criterion" />
        {soc.criterion === 'custom' ? (
          <>
            <NumField label="C, F at N = 1" unit="per year" value={soc.constantC} onChange={(v) => set({ constantC: v })} error={refused(comparison, 'criterion.constantC')} testId="fn-c-input" />
            <NumField label="alpha (1 neutral, 2 averse)" value={soc.exponentAlpha} onChange={(v) => set({ exponentAlpha: v })} error={refused(comparison, 'criterion.exponentAlpha')} testId="fn-alpha-input" />
            <NumField label="From N (blank is 1)" value={soc.minFatalities} onChange={(v) => set({ minFatalities: v })} error={refused(comparison, 'criterion.minFatalities')} />
            <NumField label="To N (blank is no end)" value={soc.maxFatalities} onChange={(v) => set({ maxFatalities: v })} error={refused(comparison, 'criterion.maxFatalities')} />
          </>
        ) : null}
      </Grid>
      <Refusal result={curve?.error ? curve : null} />
      {curve && !curve.error ? (
        <>
          {staircase.length > 0 ? (
            <FnChart staircase={staircase} line={drawn.line} points={drawn.points} />
          ) : <Note>No scenario has an expected death above 0, so there is no curve to draw.</Note>}
          <Grid cols="md:grid-cols-4">
            <Stat label="Expected deaths" unit="per year" value={formatSci(curve.expectedFatalitiesPerYr, 4)} />
            <Stat label="Frequency with N = 0" unit="per year" value={formatSci(curve.zeroFatalityFrequencyPerYr, 4)} />
          </Grid>
        </>
      ) : null}
      <Result result={comparison} basisTitle="Criterion basis">
        {comparison && !comparison.error ? (
          <div className="space-y-2" data-testid="fn-verdict">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-300">Against the criterion</span>
              <StateBadge state={comparison.state} testId="fn-state" />
              <span className="font-mono text-xs text-slate-400">
                worst ratio {formatSci(comparison.maxRatio, 3)}{comparison.worstAtFatalities !== null ? ` at N = ${formatSci(comparison.worstAtFatalities)}` : ''}
              </span>
            </div>
            <p className="text-xs text-slate-300">{FN_STATE_TEXT[comparison.state]}</p>
            {comparison.checks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="fn-checks">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-1 pr-3">N</th>
                      <th className="py-1 pr-3 text-right">Curve F (per year)</th>
                      <th className="py-1 pr-3 text-right">Criterion (per year)</th>
                      <th className="py-1 pr-3 text-right">Ratio</th>
                      <th className="py-1 pr-3">State</th>
                      <th className="py-1">Above the line over N</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-200">
                    {comparison.checks.map((c) => (
                      <tr key={c.fatalities} className="border-t border-slate-800">
                        <td className="py-1 pr-3">{formatSci(c.fatalities)}</td>
                        <td className="py-1 pr-3 text-right">{formatSci(c.curveFrequencyPerYr, 4)}</td>
                        <td className="py-1 pr-3 text-right">{formatSci(c.criterionFrequencyPerYr, 4)}</td>
                        <td className="py-1 pr-3 text-right">{formatSci(c.ratio, 3)}</td>
                        <td className="py-1 pr-3">{c.state}</td>
                        <td className="py-1">
                          {c.exceedsOverFatalities ? `${formatSci(c.exceedsOverFatalities.from)} to ${formatSci(c.exceedsOverFatalities.to)}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Note>The curve has no corner inside the criterion&apos;s range of N.</Note>}
          </div>
        ) : null}
      </Result>
      <Note>
        F(N) is the frequency of N or more deaths (Purple Book 6.6), a step at each distinct N. Above the line means
        strictly above; a curve that meets the line at a corner and stays under it elsewhere TOUCHES it. The Purple Book
        line is an orientation value for establishments and Bevi was repealed on 1 January 2024. R2P2 gives one point and
        no slope, so it is drawn as that point; for a line through it give your own alpha.
      </Note>
    </Panel>
  );
};

const SocietalRiskPanel = () => (
  <div className="space-y-4">
    <Pll />
    <FnCurve />
  </div>
);

export default SocietalRiskPanel;
