// SIF verification for the active scenario (PS1).
//
// PFDavg of each subsystem by the IEC 61508-6:2010 Annex B.3.2.2 simplified
// equations, low demand, and the SIF as their series sum (Annex B.3.2.1),
// all computed by the engine. The panel then puts the SIF against the
// scenario's required SIL and required PFDavg, and the TMEL.
import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLopaStudio } from '@/contexts/LopaStudioContext';
import {
  ARCHITECTURES, HOURS_PER_YEAR, LOPA_OUTCOME, SUBSYSTEM_ROLES, formatSci, silLabel, toNumber,
} from '@/utils/processSafety/lopaStudy';
import {
  BasisList, EngineError, Note, NumField, Stat, TextField, Warnings,
} from './shared';
import ScopeNotice from './ScopeNotice';

const REDUNDANT = new Set(['1oo2', '2oo3', '1oo3']);

const yearsOf = (hoursText) => {
  const h = toNumber(hoursText);
  return Number.isFinite(h) && h > 0 ? `${Number((h / HOURS_PER_YEAR).toPrecision(3))} yr` : '';
};

const SubsystemCard = ({ sub, evaluated }) => {
  const { setSubsystem } = useLopaStudio();
  const set = (k) => (v) => setSubsystem(sub.id, { [k]: v });
  const r = evaluated?.result;
  const field = r?.error ? r.field : null;
  const roleLabel = SUBSYSTEM_ROLES.find((x) => x.id === sub.role)?.label || sub.role;
  const redundant = REDUNDANT.has(sub.architecture);
  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3" data-testid={`subsystem-${sub.role}`}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="text-[11px] uppercase tracking-wide text-lime-300">{roleLabel}</div>
        <TextField label="Name" value={sub.name} onChange={set('name')} className="min-w-[12rem] flex-1" />
        <div>
          <Label className="text-[11px] text-slate-400">Architecture</Label>
          <select
            aria-label={`${roleLabel} architecture`}
            value={sub.architecture}
            onChange={(e) => setSubsystem(sub.id, { architecture: e.target.value })}
            className="block h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
          >
            {ARCHITECTURES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <NumField label="lambda DU" unit="per hour, per channel" value={sub.lambdaDuPerHour} onChange={set('lambdaDuPerHour')} error={field === 'lambdaDuPerHour'} />
        <NumField label="lambda DD" unit="per hour, per channel" value={sub.lambdaDdPerHour} onChange={set('lambdaDdPerHour')} placeholder="0" error={field === 'lambdaDdPerHour'} />
        <NumField label="MTTR" unit="h" value={sub.mttrHours} onChange={set('mttrHours')} error={field === 'mttrHours'} />
        <NumField label="MRT" unit="h" value={sub.mrtHours} onChange={set('mrtHours')} placeholder="0" error={field === 'mrtHours'} />
        <NumField
          label="beta (DU common cause)" unit="fraction" value={sub.beta} onChange={set('beta')}
          placeholder={redundant ? 'required' : 'not used'} error={field === 'beta'}
        />
        <NumField
          label="beta D (DD common cause)" unit="fraction" value={sub.betaD} onChange={set('betaD')}
          placeholder={redundant ? 'required if lambda DD > 0' : 'not used'} error={field === 'betaD'}
        />
        <div>
          <NumField label="Proof test interval T1" unit="h" value={sub.proofTestIntervalHours} onChange={set('proofTestIntervalHours')} error={field === 'proofTestIntervalHours'} />
          <div className="mt-0.5 text-[10px] text-slate-500">{yearsOf(sub.proofTestIntervalHours)}</div>
        </div>
        <NumField label="Proof test coverage" unit="fraction, 0 to 1" value={sub.proofTestCoverage} onChange={set('proofTestCoverage')} placeholder="1" error={field === 'proofTestCoverage'} />
        <div>
          <NumField label="Lifetime T2" unit="h" value={sub.lifetimeHours} onChange={set('lifetimeHours')} placeholder="needed if coverage < 1" error={field === 'lifetimeHours'} />
          <div className="mt-0.5 text-[10px] text-slate-500">{yearsOf(sub.lifetimeHours)}</div>
        </div>
      </div>
      {r?.error ? <EngineError result={r} /> : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="PFDavg" unit="-" value={formatSci(r.pfdAvg)} emphasis testId={`pfd-${sub.role}`} />
            <Stat label="RRF" unit="-" value={formatSci(r.rrf)} />
            <Stat label="Band" value={silLabel(r.sil, r.state)} />
            <Stat label="Dominant term" value={r.dominant} />
          </div>
          <Warnings warnings={r.warnings} />
          <BasisList basis={r.basis} title={`Engine basis (${r.architecture})`} />
        </>
      )}
    </div>
  );
};

const Verdict = () => {
  const { evaluation } = useLopaStudio();
  const { sif, lopa, withoutSif, verdict } = evaluation;
  if (!sif) return null;
  if (sif.error) return <EngineError result={sif} prefix="SIF" />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="SIF PFDavg" unit="-" value={formatSci(sif.pfdAvg)} emphasis testId="sif-pfd" />
        <Stat label="Achieved RRF" unit="-" value={formatSci(sif.rrf)} emphasis testId="sif-rrf" />
        <Stat label="Achieved band" value={silLabel(sif.sil, sif.state)} emphasis testId="sif-sil" />
        <Stat
          label="Required by the scenario"
          value={withoutSif?.error ? 'n/a' : (withoutSif.requiredSil ? `SIL ${withoutSif.requiredSil}, PFDavg ${formatSci(withoutSif.requiredSifPfdAvg)}` : withoutSif.outcome)}
        />
      </div>
      {verdict ? (
        <div data-testid="sif-verdict" className={`rounded-lg border p-3 text-sm ${verdict.kind === 'meets' || verdict.kind === 'not-required' ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-100' : 'border-red-500/50 bg-red-950/30 text-red-100'}`}>
          {verdict.kind === 'not-required' ? 'The scenario needs no SIF. The credited layers alone meet the TMEL.' : null}
          {verdict.kind === 'redesign' ? `The scenario is ${LOPA_OUTCOME.BEYOND_SIL3}: no SIF verification resolves it. ${withoutSif.note || ''}` : null}
          {verdict.kind === 'meets' || verdict.kind === 'short' ? (
            <ul className="space-y-1">
              {verdict.meetsSilBand !== null ? (
                <li>Required SIL {verdict.requiredSil}: {verdict.meetsSilBand ? 'met' : 'not met'} (achieved {silLabel(sif.sil, sif.state)}).</li>
              ) : (
                <li>The required risk reduction is below SIL 1, so there is no SIL band to meet.</li>
              )}
              <li>Required PFDavg {formatSci(withoutSif.requiredSifPfdAvg)}: {verdict.meetsRequiredPfd ? 'met' : 'not met'} (achieved {formatSci(sif.pfdAvg)}).</li>
              <li>TMEL {formatSci(lopa.tmelPerYr)} per year: {verdict.meetsTmel ? 'met' : 'not met'} (mitigated frequency with the SIF {formatSci(lopa.mitigatedFrequencyPerYr)} per year).</li>
            </ul>
          ) : null}
        </div>
      ) : null}
      <BasisList basis={sif.basis} title="Engine basis (SIF)" />
    </div>
  );
};

const SifVerification = () => {
  const { active, evaluation, setSif } = useLopaStudio();
  const enabled = active.sif?.enabled === true;
  const byId = new Map(evaluation.subsystems.map((s) => [s.id, s]));
  return (
    <div className="space-y-4">
      <ScopeNotice compact />
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <Switch
            checked={enabled}
            onCheckedChange={(c) => setSif({ enabled: c === true })}
            aria-label="Attach a SIF to this scenario"
          />
          Attach a SIF to this scenario
        </label>
        <TextField label="SIF" value={active.sif?.name} onChange={(v) => setSif({ name: v })} className="min-w-[16rem] flex-1" />
      </div>
      <Note>
        Failure rates are per channel and per hour, and every one is yours to supply from certified
        data. The example values are illustrative. A blank lambda DD, MRT or coverage takes the
        engine&apos;s default (0, 0 and 1); every other blank is refused and named.
      </Note>
      {(active.sif?.subsystems || []).map((sub) => (
        <SubsystemCard key={sub.id} sub={sub} evaluated={byId.get(sub.id)} />
      ))}
      <div className="border-t border-slate-800 pt-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-200">SIF against the scenario</h3>
        {enabled ? <Verdict /> : (
          <Note>Attach the SIF to this scenario to total its subsystems and check it against the required SIL, the required PFDavg and the TMEL.</Note>
        )}
      </div>
    </div>
  );
};

export default SifVerification;
