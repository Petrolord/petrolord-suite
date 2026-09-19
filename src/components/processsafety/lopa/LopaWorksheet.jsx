// LOPA worksheet for the active scenario (PS1).
//
// f_mitigated = IEF x enabling conditions x conditional modifiers x PFD of
// every CREDITED IPL, against the TMEL. The arithmetic, the credit rule and
// the SIL band are the engine's; this panel collects the inputs and prints
// what the engine returns, including its refusals and its reasons.
import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useLopaStudio } from '@/contexts/LopaStudioContext';
import { OUTCOME_TEXT, formatSci, silLabel } from '@/utils/processSafety/lopaStudy';
import {
  BasisList, EngineError, Note, NumField, OutcomeBadge, Stat, TextField,
} from './shared';

const ProbabilityList = ({ title, listKey, hint }) => {
  const { active, addListRow, setListRow, removeListRow } = useLopaStudio();
  const rows = active[listKey] || [];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <Button size="sm" variant="outline" onClick={() => addListRow(listKey)} className="h-7 border-slate-700 text-xs">
          <PlusCircle className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
      {rows.length === 0 ? <p className="text-xs text-slate-500">None entered. {hint}</p> : null}
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[1fr_8rem_2rem] items-end gap-2">
          <TextField label="Description" value={r.name} onChange={(v) => setListRow(listKey, r.id, { name: v })} />
          <NumField label="Probability" unit="-" value={r.probability} onChange={(v) => setListRow(listKey, r.id, { probability: v })} />
          <Button
            variant="ghost" size="icon" title="Remove"
            onClick={() => removeListRow(listKey, r.id)}
            className="h-8 w-8 text-slate-500 hover:text-red-400"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
    </div>
  );
};

const IplTable = () => {
  const {
    active, evaluation, addListRow, setListRow, removeListRow,
  } = useLopaStudio();
  const { lopa } = evaluation;
  const notCredited = new Map((lopa?.notCredited || []).map((n) => [n.name.trim().toLowerCase(), n.reason]));
  const credited = new Set((lopa?.credited || []).map((c) => c.name.trim().toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Independent protection layers</h3>
        <Button size="sm" variant="outline" onClick={() => addListRow('ipls')} className="h-7 border-slate-700 text-xs">
          <PlusCircle className="mr-1 h-3.5 w-3.5" /> Add IPL
        </Button>
      </div>
      <Note>
        A layer takes credit only when it is flagged independent (of the initiating event and of every
        other credited layer) and is not flagged unauditable. Each layer is credited once. Do not list the
        SIF being sized here: it is verified on the next tab and closes the loop against the TMEL.
      </Note>
      {(active.ipls || []).length === 0 ? <p className="text-xs text-slate-500">No layers entered.</p> : null}
      <div className="space-y-2">
        {(active.ipls || []).map((ipl) => {
          const key = (ipl.name || '').trim().toLowerCase();
          const reason = notCredited.get(key);
          const isCredited = credited.has(key);
          return (
            <div key={ipl.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2" data-testid="ipl-row">
              <div className="grid grid-cols-[1fr_7rem_2rem] items-end gap-2">
                <TextField label="Layer" value={ipl.name} onChange={(v) => setListRow('ipls', ipl.id, { name: v })} />
                <NumField label="PFD" unit="-" value={ipl.pfd} onChange={(v) => setListRow('ipls', ipl.id, { pfd: v })} />
                <Button
                  variant="ghost" size="icon" title="Remove this layer"
                  onClick={() => removeListRow('ipls', ipl.id)}
                  className="h-8 w-8 text-slate-500 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-300">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={ipl.independent === true}
                    onCheckedChange={(c) => setListRow('ipls', ipl.id, { independent: c === true })}
                    aria-label={`${ipl.name || 'Layer'} is independent`}
                  />
                  Independent
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={ipl.auditable !== false}
                    onCheckedChange={(c) => setListRow('ipls', ipl.id, { auditable: c === true })}
                    aria-label={`${ipl.name || 'Layer'} is auditable`}
                  />
                  Auditable
                </label>
                {isCredited ? <span className="text-emerald-300">Credited</span> : null}
                {reason ? <span className="text-amber-200" data-testid="not-credited-reason">Not credited: {reason}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Results = () => {
  const { evaluation } = useLopaStudio();
  const { lopa, withoutSif, sifEnabled, sif } = evaluation;
  if (lopa?.error) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">Result</h3>
        <EngineError result={lopa} />
      </div>
    );
  }
  const withSif = sifEnabled && sif && !sif.error && Number.isFinite(lopa.sifPfdAvg);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Result</h3>
        <OutcomeBadge outcome={withoutSif.outcome} testId="lopa-outcome" />
      </div>
      <p className="text-sm text-slate-200" data-testid="lopa-outcome-text">{OUTCOME_TEXT[withoutSif.outcome]}</p>
      {withoutSif.note ? <p className="text-xs text-fuchsia-200">{withoutSif.note}</p> : null}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Stat label="Unmitigated frequency" unit="/yr" value={formatSci(withoutSif.unmitigatedFrequencyPerYr)} />
        <Stat label="Product of credited IPL PFDs" unit="-" value={formatSci(withoutSif.iplProduct)} />
        <Stat label="Mitigated frequency without SIF" unit="/yr" value={formatSci(withoutSif.mitigatedFrequencyWithoutSifPerYr)} emphasis testId="f-without-sif" />
        <Stat label="TMEL" unit="/yr" value={formatSci(withoutSif.tmelPerYr)} />
        <Stat label="Required RRF" unit="-" value={formatSci(withoutSif.requiredRrf)} emphasis testId="required-rrf" />
        <Stat
          label="Required SIF PFDavg" unit="-"
          value={withoutSif.requiredSifPfdAvg === null ? 'none' : formatSci(withoutSif.requiredSifPfdAvg)}
          emphasis testId="required-pfd"
        />
      </div>
      {withSif ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          <Stat label="SIF PFDavg (from verification)" unit="-" value={formatSci(lopa.sifPfdAvg)} />
          <Stat label="Mitigated frequency with SIF" unit="/yr" value={formatSci(lopa.mitigatedFrequencyPerYr)} emphasis testId="f-with-sif" />
          <Stat
            label="Meets the TMEL" value={lopa.meetsTmel ? 'Yes' : 'No'}
            emphasis testId="meets-tmel"
          />
          <Stat label="SIF band" value={silLabel(lopa.sifBand?.sil, lopa.sifBand?.state)} />
        </div>
      ) : (
        <Note>
          {sifEnabled
            ? 'The SIF on the verification tab has an input the engine refused, so the loop is not closed yet.'
            : 'No SIF is attached to this scenario. Turn one on in SIF verification to close the loop against the TMEL.'}
        </Note>
      )}
      <Note>
        Required SIL and required PFDavg go together. A SIF in the right band can still miss the
        required PFDavg, so the verdict is taken on the PFDavg itself.
      </Note>
      <BasisList basis={withoutSif.basis} title="Engine basis (LOPA)" />
    </div>
  );
};

const LopaWorksheet = () => {
  const { active, setScenarioField } = useLopaStudio();
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Scenario" value={active.name} onChange={(v) => setScenarioField({ name: v })} />
        <TextField label="Initiating event" value={active.initiatingEvent} onChange={(v) => setScenarioField({ initiatingEvent: v })} />
        <TextField label="Consequence" value={active.consequence} onChange={(v) => setScenarioField({ consequence: v })} className="md:col-span-2" />
        <NumField
          label="Initiating event frequency (IEF)" unit="per year" value={active.iefPerYr}
          onChange={(v) => setScenarioField({ iefPerYr: v })} testId="ief-input"
        />
        <NumField
          label="Tolerable mitigated event likelihood (TMEL)" unit="per year" value={active.tmelPerYr}
          onChange={(v) => setScenarioField({ tmelPerYr: v })} testId="tmel-input"
        />
      </div>
      <Note>
        The example scenario is illustrative, written to show each part of the method. None of its
        frequencies, probabilities or PFDs is published or vendor data. Your organization&apos;s risk
        criteria set the TMEL.
      </Note>
      <ProbabilityList
        title="Enabling conditions" listKey="enablingConditions"
        hint="An enabling condition is a state that must hold for the initiating event to lead on, such as a seasonal operating mode."
      />
      <ProbabilityList
        title="Conditional modifiers" listKey="conditionalModifiers"
        hint="Probability of ignition, of personnel present, of a fatal injury, as your method uses them."
      />
      <IplTable />
      <div className="border-t border-slate-800 pt-4">
        <Results />
      </div>
    </div>
  );
};

export default LopaWorksheet;
