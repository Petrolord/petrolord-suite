// Electrofacies Studio: write a facies log to a well (Data & AI D3).
//
// The labels of one method on one of the loaded registry wells are saved as
// a NEW curve through the registry's own write path, with the method, its
// parameters, the seed, the legend and the engine version as provenance. A
// stored curve is never replaced. Before the write the panel shows, per log,
// how many of the well's labelled rows lie outside the min and max of the
// rows the method was fitted on; the counts go into the provenance and the
// write is not blocked.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useElectrofacies } from '@/contexts/ElectrofaciesContext';
import { loadWellBlock, saveLog } from '@/utils/dataAi/faciesSources';
import { labelsOf, methodText } from '@/utils/dataAi/faciesWorkflows';
import {
  buildFaciesLog, faciesCodes, faciesProvenance, mnemonicProblem, suggestFaciesMnemonic, trainingRangeCheck, wellLabels,
} from '@/utils/dataAi/faciesWriteBack';
import {
  Note, Section, SelectField, TextInput,
} from '@/components/dataai/quality/shared';
import { dn, Grid, NeedDesign } from './common';

const NAMES = {
  kmeans: 'k-means clusters', agglomerative: 'agglomerative clusters', knn: 'kNN facies', cart: 'CART facies',
};

const WriteBackPanel = () => {
  const {
    design, table, results, parsed, isStale, persistence, addNotification,
  } = useElectrofacies();
  const [key, setKey] = useState('');
  const [wellName, setWellName] = useState('');
  const [preview, setPreview] = useState(null);
  const [mnemonic, setMnemonic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  if (!design || design.error) return <NeedDesign />;
  if (table.source !== 'wells') {
    return <Note testId="writeback-upload">A facies log is written to a well in the wells registry. This data was uploaded, so there is no registry well to write to; export the labels as CSV instead.</Note>;
  }
  const keys = ['kmeans', 'agglomerative', 'knn', 'cart'].filter((k) => Array.isArray(labelsOf(results[k]?.result)) && !isStale(k));
  if (!keys.length) {
    return <Note testId="writeback-not-ready">Run k-means, agglomerative clustering, kNN or CART first (with the current settings). Their labels are what is written.</Note>;
  }
  const k = keys.includes(key) ? key : keys[0];
  const r = results[k].result;
  const labels = labelsOf(r);
  const wells = table.wells.filter((w) => w.id);
  const reset = () => { setPreview(null); setSaved(null); setError(null); };

  const prepare = async () => {
    setBusy(true);
    reset();
    try {
      const well = wells.find((w) => w.name === wellName);
      const { block, mnemonics } = await loadWellBlock(well, design.features.map((f) => f.name));
      if (block.n !== well.rows) throw new Error(`${well.name} now holds ${block.n} samples and ${well.rows} were loaded. Load the wells again before writing.`);
      const { at, values } = wellLabels({
        design, table, labels, wellName: well.name,
      });
      const codes = faciesCodes(k, labels, r);
      const range = trainingRangeCheck({
        key: k, result: r, design, labels, wellName: well.name,
      });
      setPreview({
        well, block, mnemonics, at, values: values.map(codes.code), legend: codes.legend, kind: codes.kind, range,
      });
      setMnemonic(suggestFaciesMnemonic(k, mnemonics));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const problem = preview ? mnemonicProblem(mnemonic, '', preview.mnemonics) : null;

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      const log = buildFaciesLog({
        block: preview.block,
        values: preview.values,
        at: preview.at,
        mnemonic,
        unit: '',
        description: `Electrofacies from Electrofacies Studio: ${methodText(k, r, parsed)}, on ${design.names.join(', ')}`,
        provenance: faciesProvenance({
          key: k, result: r, parsed, design, table, wellName: preview.well.name, projectName: persistence.projectName, legend: preview.legend, rangeCheck: preview.range,
        }),
      });
      const row = await saveLog(preview.well.id, log);
      setSaved({ mnemonic: log.mnemonic, well: preview.well.name, id: row?.id });
      setPreview((p) => ({ ...p, mnemonics: [...p.mnemonics, log.mnemonic] }));
      addNotification(`${log.mnemonic} was written to ${preview.well.name} as a new curve.`, 'success');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="writeback-panel">
      <Section title="Write a facies log">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Labels" value={k} onChange={(v) => { setKey(v); reset(); }} options={keys.map((x) => ({ value: x, label: NAMES[x] }))} testId="writeback-method" className="w-56" />
          <SelectField label="Well" value={wellName} onChange={(v) => { setWellName(v); reset(); }} emptyLabel="Choose a loaded well" options={wells.map((w) => ({ value: w.name, label: w.name }))} testId="writeback-well" className="w-56" />
          <Button size="sm" variant="secondary" disabled={!wellName || busy} onClick={prepare} data-testid="writeback-prepare">
            {busy && !preview ? 'Reading the well' : 'Prepare the log'}
          </Button>
        </div>
        <Note>{methodText(k, r, parsed)}.</Note>
        {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
      </Section>
      {preview ? (
        <Section title={`${preview.well.name}: the facies log`}>
          <p className="text-xs text-slate-300" data-testid="writeback-counts">
            {preview.at.length.toLocaleString('en-US')} of {preview.block.n.toLocaleString('en-US')} samples carry a code; the rest stay null
            (outside the window, thinned, missing a log{k === 'agglomerative' && r.sampled ? ', or outside the agglomerative sample' : ''}).
          </p>
          <Grid
            testId="writeback-legend"
            caption={preview.kind === 'cluster' ? 'Codes are the engine cluster numbers.' : 'Codes: the facies itself when the core facies are numbers, else its position (from 0) in the sorted facies list.'}
            headers={['Code', 'Meaning', ...(preview.kind === 'cluster' ? ['Matched core facies'] : [])]}
            rows={preview.legend.map((l) => [l.code, l.label, ...(preview.kind === 'cluster' ? [l.matchedFacies === null || l.matchedFacies === undefined ? 'not compared' : String(l.matchedFacies)] : [])])}
          />
          <Grid
            testId="writeback-range"
            caption={`Training range: the min and max of each log over ${preview.range.basis}, ${preview.range.trainingRows.toLocaleString('en-US')} rows. A value equal to a bound is inside.`}
            headers={['Log', 'Training min', 'Training max', 'Rows below', 'Rows above', 'Rows outside']}
            rows={preview.range.features.map((f) => [f.name, dn(f.min), dn(f.max), f.below, f.above, f.outside])}
          />
          {preview.range.rowsOutside ? (
            <Note tone="warn" testId="writeback-range-warning">
              {preview.range.rowsOutside.toLocaleString('en-US')} of the {preview.range.rowsChecked.toLocaleString('en-US')} labelled
              {preview.range.rowsChecked === 1 ? ' row' : ' rows'} of {preview.well.name} {preview.range.rowsOutside === 1 ? 'has' : 'have'} at least one log outside the training range.
              The method extrapolates there, so read those labels with care. The counts are stored in the provenance.
            </Note>
          ) : (
            <Note testId="writeback-range-ok">
              Every labelled row of {preview.well.name} lies inside the training range of every log.
            </Note>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <TextInput label="New curve mnemonic" value={mnemonic} onChange={setMnemonic} testId="writeback-mnemonic" width="w-40" />
            <Button size="sm" disabled={!!problem || busy || !preview.at.length} onClick={write} data-testid="writeback-save">
              Write as a new curve
            </Button>
          </div>
          {problem ? <Note tone="warn" testId="mnemonic-problem">{problem}</Note> : null}
          <Note>
            The curve is stored with its provenance: the method and its parameters, the seed, the scaling, the logs, the core
            facies source and the scores against the core, the legend, the rows and wells used, the training-range counts, and the engine version.
          </Note>
          {saved ? <Note testId="writeback-saved">{saved.mnemonic} is stored on {saved.well}. Open it in the Well Data Manager or any app that reads the registry.</Note> : null}
        </Section>
      ) : null}
    </div>
  );
};

export default WriteBackPanel;
