// ML Workbench: write a predicted curve to a well (Data & AI D2).
//
// The model fitted on every row predicts the target in a well chosen from
// the registry, from that well's own feature curves. The result is saved as
// a NEW curve through the registry's own write path, with a suffix on the
// mnemonic and the provenance of the model; a stored curve is never
// replaced.
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMlWorkbench } from '@/contexts/MlWorkbenchContext';
import { listWells, loadWellBlock, saveLog } from '@/utils/dataAi/mlSources';
import { predictionRows } from '@/utils/dataAi/mlData';
import { runMlAsync } from '@/utils/dataAi/mlJobs';
import {
  suggestMnemonic, mnemonicProblem, buildPredictedLog, mlProvenance,
} from '@/utils/dataAi/mlWriteBack';
import { displayNumber as dn } from '@/utils/dataAi/qcDisplay';
import {
  Note, Section, SelectField, TextInput,
} from '@/components/dataai/quality/shared';
import { DepthTrack, MAX_PLOT_POINTS } from './charts';

const WriteBackPanel = () => {
  const {
    results, design, parsed, table, isStale, createWorker, persistence, addNotification,
  } = useMlWorkbench();
  const [wells, setWells] = useState(null);
  const [wellId, setWellId] = useState('');
  const [preview, setPreview] = useState(null);
  const [mnemonic, setMnemonic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    let off = false;
    listWells().then((w) => { if (!off) setWells(w); }).catch((e) => { if (!off) { setWells([]); setError(e.message); } });
    return () => { off = true; };
  }, []);

  const r = results.evaluate;
  if (!r || r.task !== 'regression') {
    return <Note testId="writeback-not-ready">Fit and validate a regression model first. The model fitted on every row is the one written to a well.</Note>;
  }
  if (isStale('evaluate')) return <Note tone="warn">The spec or the data has changed since the last fit. Fit again before writing a curve.</Note>;
  const { final, evaluation } = r.result;
  if (!final || final.error) return <Note tone="warn">The model on every row was refused, so there is nothing to write.</Note>;
  const target = design.targetText;

  const predict = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const well = wells.find((w) => w.id === wellId);
      const { block, mnemonics } = await loadWellBlock(well, [...design.features.map((f) => f.name), target]);
      const missing = design.features.filter((f) => !block.curves[f.name]).map((f) => f.name);
      if (missing.length) throw new Error(`${well.name} has no ${missing.join(', ')}, which the model needs.`);
      const rows = predictionRows(block, design.features);
      const { promise } = runMlAsync('predict', { final, X: rows.X }, { createWorker });
      const pred = await promise;
      if (pred.error) throw new Error(pred.error);
      setPreview({
        well, block, rows, values: pred.values, mnemonics,
      });
      setMnemonic(suggestMnemonic(target, mnemonics));
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const problem = preview ? mnemonicProblem(mnemonic, target, preview.mnemonics) : null;

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      const log = buildPredictedLog({
        block: preview.block,
        values: preview.values,
        at: preview.rows.at,
        mnemonic,
        unit: table.units?.[target] || '',
        description: `${target} predicted by ML Workbench (${parsed.model.kind}) from ${design.names.join(', ')}`,
        provenance: mlProvenance({
          design, parsed, evaluation, final, target, table, wellName: preview.well.name, projectName: persistence.projectName,
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

  const track = preview ? preview.rows.at.map((row, j) => ({
    depth: preview.block.depth ? preview.block.depth[row] : row,
    actual: preview.block.curves[target] ? preview.block.curves[target][row] : null,
    predicted: preview.values[j],
  })) : [];
  const stride = Math.max(1, Math.ceil(track.length / MAX_PLOT_POINTS));
  const pooled = evaluation?.pooled;

  return (
    <div className="space-y-3" data-testid="writeback-panel">
      <Section title={`Predict ${target} into a well`}>
        <Note>
          The model fitted on all {design.X.length.toLocaleString('en-US')} rows of {design.wells.length} wells predicts {target} from
          {' '}{design.names.join(', ')}. Its held-out scores on whole wells were
          {pooled && !pooled.error ? ` RMSE ${dn(pooled.rmse)}, MAE ${dn(pooled.mae)}, R² ${dn(pooled.r2)}` : ' not pooled (a fold was refused)'}.
          A well unlike the training wells can do worse than that.
        </Note>
        {wells === null ? <Note>Reading the wells registry.</Note> : (
          <SelectField label="Well" value={wellId} onChange={(v) => { setWellId(v); setPreview(null); setSaved(null); }} emptyLabel="Choose a well" testId="writeback-well" options={wells.map((w) => ({ value: w.id, label: w.name }))} className="w-60" />
        )}
        <Button size="sm" variant="secondary" disabled={!wellId || busy} onClick={predict} data-testid="writeback-predict">
          {busy && !preview ? 'Predicting' : 'Predict'}
        </Button>
        {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
      </Section>
      {preview ? (
        <Section title={`${preview.well.name}: the predicted curve`}>
          <p className="text-xs text-slate-300" data-testid="writeback-counts">
            {preview.rows.X.length.toLocaleString('en-US')} of {preview.rows.n.toLocaleString('en-US')} samples predicted;
            {' '}{preview.rows.skipped.toLocaleString('en-US')} have a missing (or, for a logged feature, a zero or negative) feature and stay null.
            {preview.block.curves[target] ? ` ${preview.well.name} has a measured ${target}; it is shown for comparison and is not changed.` : ''}
          </p>
          {track.length ? (
            <DepthTrack rows={stride > 1 ? track.filter((_, i) => i % stride === 0) : track} valueLabel={target} depthLabel={`Depth (${table.depthUnit || 'm'})`} testId="writeback-track" />
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <TextInput label="New curve mnemonic" value={mnemonic} onChange={setMnemonic} testId="writeback-mnemonic" width="w-40" />
            <Button size="sm" disabled={!!problem || busy || !preview.rows.X.length} onClick={write} data-testid="writeback-save">
              Write as a new curve
            </Button>
          </div>
          {problem ? <Note tone="warn" testId="mnemonic-problem">{problem}</Note> : null}
          <Note>
            The curve is stored with its provenance: the method, the features and transforms, the scaler and coefficients,
            the training wells and rows, the validation scheme, seed and pooled scores, and the engine version.
          </Note>
          {saved ? <Note testId="writeback-saved">{saved.mnemonic} is stored on {saved.well}. Open it in the Well Data Manager or any app that reads the registry.</Note> : null}
        </Section>
      ) : null}
    </div>
  );
};

export default WriteBackPanel;
