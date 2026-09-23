// Data Quality Studio: the QC profile (Data & AI D1).
//
// Every method parameter is an input, typed as text and read by the engine.
// Where a value is pre-filled, the note under it says where it comes from,
// and a Petrolord default says it is a choice. A blank means the engine's
// own default, or for inputs the engine requires (EWMA target and sigma),
// that the check waits for you.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { useDataQualityStudio } from '@/contexts/DataQualityStudioContext';
import {
  DEFINITIONAL_CHANNELS, definitionalUnits, baselineFrom, dimensionLabel,
} from '@/utils/dataAi/qcProfile';
import { DIMENSIONS, DEFINITIONAL_LIMITS } from '@/utils/dataAi/engine/quality';
import {
  EngineError, Note, Param, Section, SelectField, TextInput, Toggle, fmt,
} from './shared';

const ChannelChecks = ({ channels, value, onChange, testId }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid={testId}>
    {channels.map((c) => (
      <Toggle key={c.key} label={c.name} checked={value.includes(c.key)} onChange={(on) => onChange(on ? [...value, c.key] : value.filter((k) => k !== c.key))} />
    ))}
  </div>
);

const LimitEditor = ({ channel, limit, onChange }) => {
  const mode = limit?.mode || 'none';
  const units = mode === 'definitional' ? definitionalUnits(limit.channel) : [];
  const def = mode === 'definitional' ? DEFINITIONAL_LIMITS[limit.channel]?.[limit.unit] : null;
  return (
    <div className="grid grid-cols-[6rem_8rem_1fr] items-end gap-2 border-t border-slate-800 pt-2" data-testid={`limit-${channel.key}`}>
      <div className="text-xs text-slate-200">
        {channel.name}
        <span className="block text-[10px] text-slate-500">{channel.unit || 'no unit'}</span>
      </div>
      <SelectField
        label="Range rule"
        value={mode}
        onChange={(m) => onChange(m === 'none' ? { mode: 'none' } : m === 'custom' ? { mode: 'custom', min: '', max: '' } : { mode: 'definitional', channel: DEFINITIONAL_CHANNELS[0], unit: definitionalUnits(DEFINITIONAL_CHANNELS[0])[0] })}
        options={[{ value: 'none', label: 'None' }, { value: 'definitional', label: 'Definitional' }, { value: 'custom', label: 'Your limits' }]}
      />
      {mode === 'definitional' ? (
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            label="Quantity"
            value={limit.channel}
            onChange={(q) => onChange({ mode: 'definitional', channel: q, unit: definitionalUnits(q)[0] })}
            options={DEFINITIONAL_CHANNELS.map((q) => ({ value: q, label: q }))}
          />
          <SelectField label="Unit" value={limit.unit} onChange={(u) => onChange({ ...limit, unit: u })} options={units.map((u) => ({ value: u, label: u === 'any' ? 'any unit' : u }))} />
          {def ? <span className="text-[10px] text-slate-500">{def.note}</span> : null}
        </div>
      ) : null}
      {mode === 'custom' ? (
        <div className="flex flex-wrap items-end gap-2">
          <TextInput label="Minimum" value={limit.min} onChange={(v) => onChange({ ...limit, min: v })} placeholder="none" />
          <TextInput label="Maximum" value={limit.max} onChange={(v) => onChange({ ...limit, max: v })} placeholder="none" />
          <span className="text-[10px] text-slate-500">{limit.note ? `Suggested: ${limit.note}. ` : ''}Plausibility limits for a tool or a basin are yours to set.</span>
        </div>
      ) : null}
    </div>
  );
};

const Baseline = ({ values, onFill }) => {
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState(null);
  const fill = () => {
    const b = baselineFrom(values, from, to);
    if (b.error) { setMsg(b); return; }
    setMsg(null);
    onFill(b);
  };
  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-slate-800 p-2">
      <TextInput label="Baseline from sample" value={from} onChange={setFrom} />
      <TextInput label="to sample" value={to} onChange={setTo} placeholder={String(values.length)} />
      <Button size="sm" variant="secondary" onClick={fill} data-testid="fill-baseline">Fill target and sigma from the baseline</Button>
      <span className="w-full text-[10px] text-slate-500">
        Target is the baseline&apos;s centre line and sigma its MRbar / 1.128, from the individuals chart on those samples
        (NIST 6.3.2.2). Choose samples you judge in control; the charts then watch the rest against them.
      </span>
      <EngineError result={msg} prefix="Baseline" />
    </div>
  );
};

const ProfilePanel = () => {
  const {
    dataset, profile, updateProfile: set, runNow, run, stale,
  } = useDataQualityStudio();
  if (!dataset) {
    return <Note testId="profile-empty">Load data first. The checks and their parameters appear here once a dataset is chosen.</Note>;
  }
  const chans = dataset.channels;
  const opts = chans.map((c) => ({ value: c.key, label: c.name }));
  const chartCh = chans.find((c) => c.key === profile.charts.key);
  const o = profile.outliers;
  const cons = profile.consistency;

  return (
    <div className="space-y-3" data-testid="profile-panel">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => runNow()} data-testid="run-qc"><Play className="mr-1 h-4 w-4" /> Run QC profile</Button>
        {run && stale ? <Note tone="warn" testId="stale-note">Parameters changed since the last run. Run again to update the results.</Note> : null}
        {!run ? <Note>Nothing has been run on this data yet.</Note> : null}
      </div>
      <Note>
        The defaults below are labelled with their source. Those marked Petrolord choice are choices made for this studio,
        open to change; they are not industry standards. The published ones cite NIST/SEMATECH e-Handbook sections.
      </Note>

      <Section title="Channels and range rules" testId="section-channels">
        <p className="text-[11px] text-slate-400">Channels to check (none ticked checks them all).</p>
        <ChannelChecks channels={chans} value={profile.channels} onChange={(v) => set(['channels'], v)} testId="channel-checks" />
        <Note>
          Only definitional limits are suggested: bounds a value cannot cross by definition, such as a fraction in [0, 1] or a
          positive density. Units are labels and are never converted; a limit in another unit is refused.
        </Note>
        {chans.map((c) => (
          <LimitEditor key={c.key} channel={c} limit={profile.limits[c.key]} onChange={(l) => set(['limits', c.key], l)} />
        ))}
      </Section>

      <Section title="Completeness" right={<Toggle label="On" checked={profile.completeness.enabled} onChange={(v) => set(['completeness', 'enabled'], v)} />}>
        <Note>The fraction of samples present and every run of missing samples. Missing is a blank, a null or NaN.</Note>
        <TextInput
          label="Coverage: largest step that still counts as covered"
          value={profile.completeness.coverageMaxStep}
          onChange={(v) => set(['completeness', 'coverageMaxStep'], v)}
          unit={dataset.index?.unit || 'index units'}
          placeholder="off"
          source="Optional. Blank leaves coverage off; there is no default step."
        />
      </Section>

      <Section title="Validity">
        {dataset.index ? (
          <div className="space-y-2">
            <Toggle label={`Index checks on ${dataset.index.name}: missing, duplicate, reversed and irregular steps`} checked={profile.validity.index.enabled} onChange={(v) => set(['validity', 'index', 'enabled'], v)} />
            <div className="flex flex-wrap gap-3">
              <SelectField label="Direction" value={profile.validity.index.direction} onChange={(v) => set(['validity', 'index', 'direction'], v)} options={[{ value: 'increasing', label: 'increasing' }, { value: 'decreasing', label: 'decreasing' }]} />
              <TextInput label="Expected step" unit={dataset.index.unit} value={profile.validity.index.expectedStep} onChange={(v) => set(['validity', 'index', 'expectedStep'], v)} placeholder="median" source="Blank: the median step (engine default)." />
              <TextInput label="Step tolerance" unit={dataset.index.unit} value={profile.validity.index.stepTolerance} onChange={(v) => set(['validity', 'index', 'stepTolerance'], v)} placeholder="1e-6 x step" source="Blank: 1e-6 x the expected step (engine default)." />
            </div>
            {dataset.index.kind === 'time' ? (
              <Note>Dates are counted in days. Calendar months are 28 to 31 days, so monthly rows show irregular steps unless you type a tolerance such as 3.</Note>
            ) : null}
          </div>
        ) : <Note>This dataset has no index column, so the index checks do not apply.</Note>}
        <Toggle label="Range rules (set per channel above)" checked={profile.validity.ranges.enabled} onChange={(v) => set(['validity', 'ranges', 'enabled'], v)} />
        <Toggle label="Rate rules: a negative rate, or a rate reported while shut in (hours on = 0)" checked={profile.validity.rate.enabled} onChange={(v) => set(['validity', 'rate', 'enabled'], v)} />
        {profile.validity.rate.enabled ? (
          <div className="space-y-1 pl-5">
            <ChannelChecks channels={chans} value={profile.validity.rate.rateKeys} onChange={(v) => set(['validity', 'rate', 'rateKeys'], v)} />
            <SelectField label="Hours on channel" value={profile.validity.rate.hoursOnKey} onChange={(v) => set(['validity', 'rate', 'hoursOnKey'], v)} emptyLabel="None" options={opts} className="w-48" />
          </div>
        ) : null}
      </Section>

      <Section title="Consistency">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Cumulative channel (must not fall)" value={cons.cumulative.key} onChange={(v) => set(['consistency', 'cumulative', 'key'], v)} emptyLabel="None" options={opts} className="w-48" />
          <Param name="cumulativeTolerance" label="Tolerance" value={cons.cumulative.tolerance} onChange={(v) => set(['consistency', 'cumulative', 'tolerance'], v)} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Water cut channel" value={cons.waterCut.wcKey} onChange={(v) => set(['consistency', 'waterCut', 'wcKey'], v)} emptyLabel="None" options={opts} className="w-40" />
          <SelectField label="Oil rate" value={cons.waterCut.oilKey} onChange={(v) => set(['consistency', 'waterCut', 'oilKey'], v)} emptyLabel="None" options={opts} className="w-40" />
          <SelectField label="Water rate" value={cons.waterCut.waterKey} onChange={(v) => set(['consistency', 'waterCut', 'waterKey'], v)} emptyLabel="None" options={opts} className="w-40" />
          <Param name="waterCutTolerance" label="Tolerance" value={cons.waterCut.tolerance} onChange={(v) => set(['consistency', 'waterCut', 'tolerance'], v)} />
        </div>
        <Note>Water cut is checked in [0, 1] and, with oil and water rates, against water / (oil + water) on a liquid basis. Without a water cut channel the ratio is computed and nothing is scored.</Note>
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400">Phase sum: parts that must add to a total</p>
          <ChannelChecks channels={chans} value={cons.phaseSum.partKeys} onChange={(v) => set(['consistency', 'phaseSum', 'partKeys'], v)} />
          <div className="flex flex-wrap items-end gap-3">
            <SelectField label="Total channel" value={cons.phaseSum.totalKey} onChange={(v) => set(['consistency', 'phaseSum', 'totalKey'], v)} emptyLabel="None" options={opts} className="w-40" />
            <Param name="phaseRelTolerance" label="Relative tolerance" value={cons.phaseSum.relTolerance} onChange={(v) => set(['consistency', 'phaseSum', 'relTolerance'], v)} />
            <TextInput label="Absolute tolerance" value={cons.phaseSum.absTolerance} onChange={(v) => set(['consistency', 'phaseSum', 'absTolerance'], v)} />
          </div>
        </div>
        <Toggle label="Frozen value runs on every checked channel" checked={cons.frozen.enabled} onChange={(v) => set(['consistency', 'frozen', 'enabled'], v)} />
        <div className="flex flex-wrap gap-3 pl-5">
          <Param name="frozenMinRun" label="Shortest run" unit="samples" value={cons.frozen.minRun} onChange={(v) => set(['consistency', 'frozen', 'minRun'], v)} />
          <Param name="frozenTolerance" label="Tolerance" value={cons.frozen.tolerance} onChange={(v) => set(['consistency', 'frozen', 'tolerance'], v)} />
        </div>
      </Section>

      <Section title="Uniqueness" right={<Toggle label="On" checked={profile.uniqueness.enabled} onChange={(v) => set(['uniqueness', 'enabled'], v)} />}>
        {dataset.identifiers ? (
          <Note>{dataset.identifiers.values.length} identifiers: {dataset.identifiers.name}, {dataset.identifiers.note}.</Note>
        ) : <Note>This dataset has no identifier column, so uniqueness is not checked.</Note>}
        <div className="flex flex-wrap items-end gap-3">
          <Param name="maxDistance" label="Near duplicate: most edits" value={profile.uniqueness.maxDistance} onChange={(v) => set(['uniqueness', 'maxDistance'], v)} />
          <Toggle label="Near duplicates must share their digits (so Well-1 and Well-2 stay two wells)" checked={profile.uniqueness.digitsMustMatch} onChange={(v) => set(['uniqueness', 'digitsMustMatch'], v)} />
          <Toggle label="Strip leading zeros in each number (Well-007 = WELL 7)" checked={profile.uniqueness.stripLeadingZeros} onChange={(v) => set(['uniqueness', 'stripLeadingZeros'], v)} />
        </div>
      </Section>

      <Section title="Outliers, one channel at a time">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Toggle label="z-score (sample SD)" checked={o.z.enabled} onChange={(v) => set(['outliers', 'z', 'enabled'], v)} />
            <div className="flex gap-2">
              <Param name="zThreshold" label="|z| above" value={o.z.threshold} onChange={(v) => set(['outliers', 'z', 'threshold'], v)} />
              <SelectField label="SD" value={o.z.sd} onChange={(v) => set(['outliers', 'z', 'sd'], v)} options={[{ value: 'sample', label: 'sample (n - 1)' }, { value: 'population', label: 'population (n)' }]} />
            </div>
          </div>
          <div className="space-y-1">
            <Toggle label="Modified z-score (median and MAD)" checked={o.modz.enabled} onChange={(v) => set(['outliers', 'modz', 'enabled'], v)} />
            <Param name="modzThreshold" label="|M| above" value={o.modz.threshold} onChange={(v) => set(['outliers', 'modz', 'threshold'], v)} />
          </div>
          <div className="space-y-1">
            <Toggle label="Tukey fences" checked={o.tukey.enabled} onChange={(v) => set(['outliers', 'tukey', 'enabled'], v)} />
            <div className="flex gap-2">
              <Param name="tukeyK" label="k x IQR" value={o.tukey.k} onChange={(v) => set(['outliers', 'tukey', 'k'], v)} />
              <SelectField label="Quartiles" value={o.tukey.method} onChange={(v) => set(['outliers', 'tukey', 'method'], v)} options={[{ value: 'R7', label: 'R7' }, { value: 'R6', label: 'R6' }, { value: 'R8', label: 'R8' }]} />
            </div>
          </div>
          <div className="space-y-1">
            <Toggle label="Hampel (moving window median and MAD)" checked={o.hampel.enabled} onChange={(v) => set(['outliers', 'hampel', 'enabled'], v)} />
            <div className="flex gap-2">
              <Param name="hampelHalfWindow" label="Half window" unit="samples" value={o.hampel.halfWindow} onChange={(v) => set(['outliers', 'hampel', 'halfWindow'], v)} />
              <Param name="hampelNSigma" label="n sigma" value={o.hampel.nSigma} onChange={(v) => set(['outliers', 'hampel', 'nSigma'], v)} />
            </div>
          </div>
          <div className="space-y-1">
            <Toggle label="Grubbs test for one outlier" checked={o.grubbs.enabled} onChange={(v) => set(['outliers', 'grubbs', 'enabled'], v)} />
            <div className="flex gap-2">
              <Param name="grubbsAlpha" label="alpha" value={o.grubbs.alpha} onChange={(v) => set(['outliers', 'grubbs', 'alpha'], v)} />
              <SelectField label="Side" value={o.grubbs.side} onChange={(v) => set(['outliers', 'grubbs', 'side'], v)} options={[{ value: 'two-sided', label: 'two-sided' }, { value: 'max', label: 'largest' }, { value: 'min', label: 'smallest' }]} />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Mahalanobis distance, channels together" right={<Toggle label="On" checked={profile.mahalanobis.enabled} onChange={(v) => set(['mahalanobis', 'enabled'], v)} />}>
        <ChannelChecks channels={chans} value={profile.mahalanobis.keys} onChange={(v) => set(['mahalanobis', 'keys'], v)} testId="mahal-checks" />
        <Param name="mahalanobisAlpha" label="alpha" value={profile.mahalanobis.alpha} onChange={(v) => set(['mahalanobis', 'alpha'], v)} />
        <Note>Classical mean and sample covariance, cutoff the chi-square (1 - alpha) quantile on as many degrees of freedom as channels. Rows with a missing value are skipped and listed.</Note>
      </Section>

      <Section title="Control charts on one series">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Channel" value={profile.charts.key} onChange={(v) => set(['charts', 'key'], v)} emptyLabel="None" options={opts} className="w-44" testId="chart-channel" />
          <TextInput label="From sample" value={profile.charts.from} onChange={(v) => set(['charts', 'from'], v)} placeholder="1" />
          <TextInput label="To sample" value={profile.charts.to} onChange={(v) => set(['charts', 'to'], v)} placeholder="last" />
        </div>
        {chartCh ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <TextInput label="In-control target" unit={chartCh.unit} value={profile.charts.target} onChange={(v) => set(['charts', 'target'], v)} placeholder="required" testId="chart-target" source="EWMA and CUSUM need it; there is no default." />
              <TextInput label="In-control sigma" unit={chartCh.unit} value={profile.charts.sigma} onChange={(v) => set(['charts', 'sigma'], v)} placeholder="required" testId="chart-sigma" source="From historical in-control data, never from the data being watched." />
            </div>
            <Baseline
              values={chartCh.values}
              onFill={(b) => { set(['charts', 'target'], String(b.target)); set(['charts', 'sigma'], String(b.sigma)); }}
            />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Toggle label="Individuals and moving range" checked={profile.charts.individuals.enabled} onChange={(v) => set(['charts', 'individuals', 'enabled'], v)} />
                <TextInput label="Centre" value={profile.charts.individuals.centre} onChange={(v) => set(['charts', 'individuals', 'centre'], v)} placeholder="data mean" />
                <TextInput label="MRbar" value={profile.charts.individuals.mrBar} onChange={(v) => set(['charts', 'individuals', 'mrBar'], v)} placeholder="data MRbar" />
              </div>
              <div className="space-y-1">
                <Toggle label="EWMA" checked={profile.charts.ewma.enabled} onChange={(v) => set(['charts', 'ewma', 'enabled'], v)} />
                <Param name="ewmaLambda" label="lambda" value={profile.charts.ewma.lambda} onChange={(v) => set(['charts', 'ewma', 'lambda'], v)} />
                <Param name="ewmaL" label="L" value={profile.charts.ewma.L} onChange={(v) => set(['charts', 'ewma', 'L'], v)} />
                <SelectField label="Limits" value={profile.charts.ewma.limits} onChange={(v) => set(['charts', 'ewma', 'limits'], v)} options={[{ value: 'asymptotic', label: 'asymptotic' }, { value: 'exact', label: 'exact (time-varying)' }]} />
              </div>
              <div className="space-y-1">
                <Toggle label="Tabular CUSUM" checked={profile.charts.cusum.enabled} onChange={(v) => set(['charts', 'cusum', 'enabled'], v)} />
                <SelectField label="k and h in" value={profile.charts.cusum.units} onChange={(v) => set(['charts', 'cusum', 'units'], v)} options={[{ value: 'sigma', label: 'multiples of sigma' }, { value: 'data', label: 'the data units' }]} />
                <Param name="cusumK" label="k" value={profile.charts.cusum.k} onChange={(v) => set(['charts', 'cusum', 'k'], v)} />
                <Param name="cusumH" label="h" value={profile.charts.cusum.h} onChange={(v) => set(['charts', 'cusum', 'h'], v)} />
              </div>
            </div>
          </>
        ) : <Note>Choose a channel to chart. Control charts need a complete series: a gap is refused, so pick a window without one.</Note>}
      </Section>

      <Section title="Scorecard weights">
        <Note>Blank everywhere gives equal weights (engine default). Once one is typed, every scored dimension needs one; they are divided by their sum.</Note>
        <div className="flex flex-wrap gap-3">
          {DIMENSIONS.map((d) => (
            <TextInput key={d} label={dimensionLabel(d)} value={profile.scorecard.weights[d]} onChange={(v) => set(['scorecard', 'weights', d], v)} placeholder="equal" />
          ))}
        </div>
      </Section>
      {run ? <p className="text-[10px] text-slate-500">Last run: {fmt(run.dataset.n)} samples, {run.flags.length} flags.</p> : null}
    </div>
  );
};

export default ProfilePanel;
