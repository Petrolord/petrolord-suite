// Event tree (PS3): a continuous or instantaneous flammable release split
// into immediate ignition, delayed ignition (flash fire or explosion) and no
// ignition. The direct ignition probability can come from Purple Book Table
// 4.5. Register scenarios can take their frequency from any outcome here.
import React from 'react';
import { useQraStudio } from '@/contexts/QraStudioContext';
import {
  IGNITION_MODES, RELEASE_TYPES, SPLIT_MODES, SUBSTANCES, formatSci, formatPercent,
} from '@/utils/processSafety/qraStudy';
import {
  Grid, Note, NumField, Panel, Result, SelectField, Stat, refused,
} from './fields';

const EventTreePanel = () => {
  const { study, evaluation, setSection } = useQraStudio();
  const et = study.eventTree;
  const { ignition, tree } = evaluation.eventTree;
  const set = (patch) => setSection('eventTree', patch);
  return (
    <div className="space-y-4">
      <Panel title="Release and ignition" testId="event-tree-inputs">
        <Grid cols="md:grid-cols-4">
          <NumField
            label="Initiating frequency f0" unit="per year" value={et.initiatingFrequencyPerYr}
            onChange={(v) => set({ initiatingFrequencyPerYr: v })} error={refused(tree, 'initiatingFrequencyPerYr')}
            testId="f0-input"
          />
          <SelectField label="Immediate ignition from" value={et.immediateMode} options={IGNITION_MODES} onChange={(v) => set({ immediateMode: v })} testId="ignition-mode" />
          {et.immediateMode === 'typed' ? (
            <NumField
              label="Immediate ignition probability" value={et.immediateIgnitionProbability}
              onChange={(v) => set({ immediateIgnitionProbability: v })} error={refused(tree, 'immediateIgnitionProbability')}
              testId="immediate-input"
            />
          ) : (
            <>
              <SelectField label="Release type" value={et.releaseType} options={RELEASE_TYPES} onChange={(v) => set({ releaseType: v })} testId="release-type" />
              {et.releaseType === 'instantaneous' ? (
                <NumField label="Mass released" unit="kg" value={et.massKg} onChange={(v) => set({ massKg: v })} error={refused(ignition, 'massKg')} testId="mass-input" />
              ) : (
                <NumField label="Release rate" unit="kg/s" value={et.massRateKgS} onChange={(v) => set({ massRateKgS: v })} error={refused(ignition, 'massRateKgS')} testId="rate-input" />
              )}
              <SelectField label="Substance (PB Table 4.7 reactivity)" value={et.substance} options={SUBSTANCES} onChange={(v) => set({ substance: v })} className="md:col-span-2" testId="substance" />
            </>
          )}
          <NumField
            label="Delayed ignition, given no immediate ignition" value={et.delayedIgnitionProbability}
            onChange={(v) => set({ delayedIgnitionProbability: v })} error={refused(tree, 'delayedIgnitionProbability')}
            testId="delayed-input"
          />
          <SelectField label="Ignited cloud split" value={et.splitMode} options={SPLIT_MODES} onChange={(v) => set({ splitMode: v })} className="md:col-span-2" testId="split-mode" />
          {et.splitMode === 'given' ? (
            <>
              <NumField label="Flash fire share" value={et.flashFire} onChange={(v) => set({ flashFire: v })} error={refused(tree, 'vapourCloudSplit')} testId="flash-share-input" />
              <NumField label="Explosion share" value={et.explosion} onChange={(v) => set({ explosion: v })} error={refused(tree, 'vapourCloudSplit')} testId="explosion-share-input" />
            </>
          ) : null}
        </Grid>
        {ignition ? (
          <Result result={ignition} basisTitle="Direct ignition basis">
            <Grid cols="md:grid-cols-4">
              <Stat label="Direct ignition probability" value={formatSci(ignition.probability)} testId="ignition-probability" />
              <Stat label="Table 4.5 band" value={ignition.band} testId="ignition-band" />
            </Grid>
          </Result>
        ) : null}
        <Note>
          Table 4.5 covers stationary installations. Its middle band (10 to 100 kg/s, 1000 to 10,000 kg) is read as closed
          at both ends, so exactly 10 kg/s is in it. Delayed ignition over time (Purple Book Appendix 4.A) is not a preset:
          the probability is yours.
        </Note>
      </Panel>

      <Panel title="Outcomes" testId="event-tree-outcomes">
        <Result result={tree}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="py-1 pr-3">Path</th>
                  <th className="py-1 pr-3">Outcome</th>
                  <th className="py-1 pr-3 text-right">Path probability</th>
                  <th className="py-1 text-right">Frequency (per year)</th>
                </tr>
              </thead>
              <tbody className="font-mono text-slate-200">
                {tree && !tree.error ? tree.outcomes.map((o) => (
                  <tr key={o.path.join('/')} className="border-t border-slate-800">
                    <td className="py-1 pr-3 font-sans text-slate-300">{o.path.join(' > ')}</td>
                    <td className="py-1 pr-3 font-sans">{o.outcome}</td>
                    <td className="py-1 pr-3 text-right">{formatPercent(o.probability)}</td>
                    <td className="py-1 text-right" data-testid={`outcome-${o.outcome.replace(/\s+/g, '-')}`}>{formatSci(o.frequencyPerYr, 4)}</td>
                  </tr>
                )) : null}
              </tbody>
            </table>
          </div>
          {tree && !tree.error ? (
            <Grid cols="md:grid-cols-4">
              <Stat label="Sum of the outcomes" unit="per year" value={formatSci(tree.totalFrequencyPerYr, 4)} testId="tree-total" />
            </Grid>
          ) : null}
        </Result>
        <Note>
          Every branch set sums to 1. A register scenario whose frequency comes from the event tree takes the total of the
          named outcome, so changing the tree moves the register with it.
        </Note>
      </Panel>
    </div>
  );
};

export default EventTreePanel;
