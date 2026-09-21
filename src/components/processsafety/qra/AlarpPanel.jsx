// ALARP and cost-benefit (PS3): the band every judged risk falls in, and the
// gross disproportion test of a risk reduction measure with its cost per
// fatality prevented (ICAF), benefits and costs discounted by the canonical
// economics npv inside the engine.
import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQraStudio } from '@/contexts/QraStudioContext';
import {
  BAND_TEXT, DELTA_SOURCES, HSE_ILLUSTRATIVE_VALUES, VERDICT_TEXT, formatMoney, formatSci, newId,
} from '@/utils/processSafety/qraStudy';
import {
  Grid, Note, NumField, Panel, Refusal, RemoveButton, Result, SelectField, Stat, StateBadge, TextField, refused,
} from './fields';

const Verdict = () => {
  const { evaluation } = useQraStudio();
  const { locations } = evaluation.register;
  const { irpa, irpaBand } = evaluation.individual;
  const { comparison } = evaluation.societal;
  const rows = [
    ...locations.map((r) => ({
      key: r.id, what: `LSIR at ${r.label}`, value: r.lsir.error ? null : r.lsir.lsirPerYr, band: r.band, refusal: r.lsir.error ? r.lsir : null,
    })),
    {
      key: 'irpa', what: 'IRPA, most exposed person', value: irpa?.error ? null : irpa?.irpaPerYr, band: irpaBand, refusal: irpa?.error ? irpa : null,
    },
  ];
  const judged = rows.filter((r) => r.band && !r.band.error);
  const unacceptable = judged.some((r) => r.band.band === 'UNACCEPTABLE');
  const tolerable = judged.some((r) => r.band.band === 'TOLERABLE');
  let reading = 'Every judged risk is broadly acceptable.';
  if (unacceptable) reading = 'At least one risk is UNACCEPTABLE: it must be reduced before cost is weighed at all.';
  else if (tolerable) reading = 'At least one risk is TOLERABLE: every reasonably practicable measure is expected, and the cost-benefit test below is how a measure is judged.';
  return (
    <Panel title="ALARP verdict" testId="alarp-verdict">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-1 pr-3">Risk</th>
              <th className="py-1 pr-3 text-right">Per year</th>
              <th className="py-1 pr-3">Upper limit</th>
              <th className="py-1 pr-3">Lower limit</th>
              <th className="py-1">Band</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-slate-800">
                <td className="py-1 pr-3 text-slate-300">{r.what}</td>
                {r.refusal ? <td colSpan={4} className="py-1"><Refusal result={r.refusal} /></td> : (
                  <>
                    <td className="py-1 pr-3 text-right font-mono text-white">{formatSci(r.value, 4)}</td>
                    <td className="py-1 pr-3 font-mono text-slate-300">{r.band && !r.band.error ? formatSci(r.band.basis.thresholds.unacceptableAbovePerYr) : ''}</td>
                    <td className="py-1 pr-3 font-mono text-slate-300">{r.band && !r.band.error ? formatSci(r.band.basis.thresholds.broadlyAcceptableAtOrBelowPerYr) : ''}</td>
                    <td className="py-1">
                      {r.band?.error ? <Refusal result={r.band} /> : <StateBadge state={r.band?.band} testId={`verdict-${r.key}`} />}
                    </td>
                  </>
                )}
              </tr>
            ))}
            <tr className="border-t border-slate-800">
              <td className="py-1 pr-3 text-slate-300">F-N curve</td>
              <td colSpan={3} className="py-1 pr-3 text-slate-400">against the chosen criterion</td>
              <td className="py-1">{comparison && !comparison.error ? <StateBadge state={comparison.state} testId="verdict-fn" /> : <Refusal result={comparison} />}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3" data-testid="band-legend">
        {Object.entries(BAND_TEXT).map(([band, text]) => (
          <div key={band} className="rounded border border-slate-800 p-2 text-[11px] text-slate-300">
            <StateBadge state={band} />
            <p className="mt-1">{text}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-200" data-testid="alarp-reading">{reading}</p>
      <Note>
        The bands are the engine&apos;s, judged against each risk&apos;s own criterion; the one line summary above is the
        studio&apos;s reading of them. A value exactly at a limit belongs to the lower band.
      </Note>
    </Panel>
  );
};

const CostBenefit = () => {
  const {
    study, evaluation, setSection, updateListItem, addListItem, removeListItem,
  } = useQraStudio();
  const cb = study.costBenefit;
  const { delta, result } = evaluation.costBenefit;
  const { pll } = evaluation.societal;
  const set = (patch) => setSection('costBenefit', patch);
  const ok = result && !result.error;
  return (
    <Panel title="Cost-benefit and gross disproportion" testId="cba">
      <Grid cols="md:grid-cols-4">
        <TextField label="Measure" value={cb.measure} onChange={(v) => set({ measure: v })} className="md:col-span-2" />
        <SelectField label="PLL reduction from" value={cb.deltaSource} options={DELTA_SOURCES} onChange={(v) => set({ deltaSource: v })} className="md:col-span-2" testId="delta-source" />
        {cb.deltaSource === 'register' ? (
          <>
            <Stat label="Register PLL" unit="per year" value={pll && !pll.error ? formatSci(pll.pllPerYr, 4) : 'n/a'} />
            <NumField label="PLL after the measure" unit="per year" value={cb.pllAfterPerYr} onChange={(v) => set({ pllAfterPerYr: v })} error={refused(result, 'pllAfterPerYr')} testId="pll-after-input" />
            <Stat label="Reduction (studio subtraction)" unit="per year" value={delta?.refusal ? 'n/a' : formatSci(delta?.value, 4)} testId="delta-value" />
          </>
        ) : (
          <NumField label="PLL reduction" unit="deaths per year" value={cb.deltaPllPerYr} onChange={(v) => set({ deltaPllPerYr: v })} error={refused(result, 'deltaPllPerYr')} testId="delta-input" />
        )}
        <NumField label="Value of preventing a fatality (VPF)" unit="currency" value={cb.vpf} onChange={(v) => set({ vpf: v })} error={refused(result, 'vpf')} testId="vpf-input" />
        <NumField label="Life of the measure" unit="whole years" value={cb.lifetimeYears} onChange={(v) => set({ lifetimeYears: v })} error={refused(result, 'lifetimeYears')} testId="life-input" />
        <NumField label="Capital cost at year 0" unit="currency" value={cb.capitalCost} onChange={(v) => set({ capitalCost: v })} error={refused(result, 'capitalCost')} testId="capital-input" />
        <NumField label="Annual cost, net of savings (blank is 0)" unit="currency per year" value={cb.annualCost} onChange={(v) => set({ annualCost: v })} error={refused(result, 'annualCost')} />
        <NumField label="Disproportion factor (DF)" value={cb.disproportionFactor} onChange={(v) => set({ disproportionFactor: v })} error={refused(result, 'disproportionFactor')} testId="df-input" />
        <NumField label="Benefit discount rate (blank is 0)" unit="% per year" value={cb.benefitDiscountRatePct} onChange={(v) => set({ benefitDiscountRatePct: v })} error={refused(result, 'benefitDiscountRate')} />
        <NumField label="Cost discount rate (blank is 0)" unit="% per year" value={cb.costDiscountRatePct} onChange={(v) => set({ costDiscountRatePct: v })} error={refused(result, 'costDiscountRate')} />
        <NumField label="Benefit growth (blank is 0)" unit="% per year" value={cb.benefitGrowthRatePct} onChange={(v) => set({ benefitGrowthRatePct: v })} error={refused(result, 'benefitGrowthRate')} />
      </Grid>

      <div className="space-y-2">
        <div className="text-xs text-slate-400">Other harms prevented (injury and ill health)</div>
        {cb.otherHarms.map((h, k) => {
          const setH = (patch) => updateListItem('costBenefit', 'otherHarms', h.id, patch);
          const f = `otherHarms[${k}]`;
          return (
            <div key={h.id} className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]" data-testid={`harm-${k}`}>
              <TextField label="Harm" value={h.name} onChange={(v) => setH({ name: v })} />
              <NumField label="Cases prevented" unit="per year" value={h.expectedCasesPerYr} onChange={(v) => setH({ expectedCasesPerYr: v })} error={refused(result, `${f}.expectedCasesPerYr`)} />
              <NumField label="Value per case" unit="currency" value={h.valuePerCase} onChange={(v) => setH({ valuePerCase: v })} error={refused(result, `${f}.valuePerCase`)} />
              <div className="flex items-end"><RemoveButton label={`Remove harm ${h.name || k + 1}`} onClick={() => removeListItem('costBenefit', 'otherHarms', h.id)} /></div>
            </div>
          );
        })}
        <Button
          type="button" size="sm" variant="outline" className="border-slate-700 bg-slate-900 text-slate-200"
          onClick={() => addListItem('costBenefit', 'otherHarms', {
            id: newId('h'), name: '', expectedCasesPerYr: '', valuePerCase: '',
          })}
        >
          <Plus className="mr-1 h-4 w-4" /> Add a harm
        </Button>
      </div>

      <Result result={result} basisTitle="Cost-benefit basis">
        {ok ? (
          <>
            <Grid cols="md:grid-cols-4">
              <Stat label="Benefit per year" value={formatMoney(result.benefitPerYr)} testId="benefit-per-year" />
              <Stat label="Present value of the benefit" value={formatMoney(result.presentValueBenefit)} emphasis testId="pv-benefit" />
              <Stat label="Present value of the cost" value={formatMoney(result.presentValueCost)} emphasis testId="pv-cost" />
              <Stat label="Cost / benefit" value={formatSci(result.costToBenefitRatio, 4)} testId="cb-ratio" />
              <Stat label="Most a measure can reasonably cost (DF x benefit)" value={formatMoney(result.maximumReasonablyPracticableCost)} testId="max-cost" />
              <Stat label="Fatalities prevented over the life" value={formatSci(result.fatalitiesPrevented, 4)} />
              <Stat
                label="Cost per fatality prevented (ICAF)"
                value={result.costPerFatalityPrevented === null ? 'n/a (no fatality prevented)' : formatMoney(result.costPerFatalityPrevented)}
                testId="icaf"
              />
              <Stat label="Fatality benefit per year" value={formatMoney(result.fatalityBenefitPerYr)} />
            </Grid>
            <div className="space-y-1" data-testid="cba-verdict">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-300">Verdict</span>
                <StateBadge state={result.verdict} testId="cba-state" />
                {result.atBoundary ? <span className="text-xs text-amber-200">the cost is exactly DF x benefit</span> : null}
              </div>
              <p className="text-xs text-slate-300">{VERDICT_TEXT[result.verdict]}</p>
              {result.otherHarms.length > 0 ? (
                <p className="font-mono text-[11px] text-slate-400">
                  {result.otherHarms.map((h) => `${h.name} ${formatMoney(h.benefitPerYr)} a year`).join('; ')}
                </p>
              ) : null}
              <p className="text-[11px] text-slate-400">{result.basis.discounting}.</p>
            </div>
          </>
        ) : null}
      </Result>
      <Note>
        The test is the HSE checklist&apos;s: a measure is not reasonably practicable when cost / benefit is above DF. HSE
        says DFs &quot;vary from upwards of 1&quot;. The VPF is always yours; for reference only, R2P2 quotes about{' '}
        {formatMoney(HSE_ILLUSTRATIVE_VALUES.vpfGbp2001.value)} GBP at 2001 prices and the checklist{' '}
        {formatMoney(HSE_ILLUSTRATIVE_VALUES.vpfGbp2003Q3.value)} GBP at 2003 prices. Flows fall at year end: capital at
        year 0, costs and benefits in years 1 to n, each discounted by the canonical economics npv. The ICAF is the
        present value of the cost over the fatalities prevented, counted undiscounted (R2P2 Appendix 3 para 15).
      </Note>
    </Panel>
  );
};

const AlarpPanel = () => (
  <div className="space-y-4">
    <Verdict />
    <CostBenefit />
  </div>
);

export default AlarpPanel;
