// The analytical aquifer of the Model Builder (SIM-U2-004, RL11): Fetkovich
// or Carter-Tracy, typed or taken by id from a Material Balance case (the
// mbal-1 record: the numbers the case's last run used, fitted values first),
// joined to one face of the grid. `?mbalAquifer=<rb_cases id>` in the address
// preselects a case. The card says where every value came from and which were
// edited after taking them.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { listMbalCases } from '@/lib/simService';
import { readMbalCase } from '@/lib/mbalCaseSource';
import {
  aquiferFromMbal, aquiferEditedKeys, AQUIFER_MODELS, AQUIFER_FACE_WORDS,
} from '@/utils/simstudio/aquiferIntake';

const selectCls = 'h-8 w-full rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text';
export const MBAL_AQUIFER_PARAM = 'mbalAquifer';

const FET_FIELDS = [['W_rb', 'Water in place W (rb)'], ['J_rb_d_psi', 'Productivity index J (rb/d/psi)'], ['ct_psi', 'Total compressibility ct (1/psi)']];
const CT_FIELDS = [['k_md', 'Permeability k (mD)'], ['phi', 'Porosity (fraction)'], ['h_ft', 'Thickness h (ft)'], ['theta_deg', 'Encroachment angle (deg)'], ['r_R_ft', 'Reservoir radius r_R (ft)'], ['reD', 'Radius ratio reD (blank = infinite)'], ['muw_cp', 'Water viscosity (cP)'], ['ct_psi', 'Total compressibility ct (1/psi)']];

export default function AquiferCard({ form, setForm, canWrite, addNotification }) {
  const [params] = useSearchParams();
  const named = params.get(MBAL_AQUIFER_PARAM);
  const aq = form.aquifer;
  const [cases, setCases] = useState(null);
  const [caseId, setCaseId] = useState(named || aq?.intake?.from?.recordId || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    listMbalCases().then((rows) => { if (alive) setCases(rows); }).catch(() => { if (alive) setCases([]); });
    return () => { alive = false; };
  }, []);
  if (!aq) return null;
  const set = (patch) => setForm((f) => ({ ...f, aquifer: { ...f.aquifer, ...patch } }));
  const setField = (group, key, v) => setForm((f) => ({ ...f, aquifer: { ...f.aquifer, [group]: { ...f.aquifer[group], [key]: v } } }));

  const take = async () => {
    if (!caseId) return;
    setBusy(true); setMessage('');
    const { record, error } = await readMbalCase(supabase, caseId);
    setBusy(false);
    if (!record) { setMessage(error || 'The case could not be read.'); return; }
    const got = aquiferFromMbal(record);
    if (!got.ok) { setMessage(got.reason); return; }
    setForm((f) => ({
      ...f,
      aquifer: {
        ...f.aquifer, enabled: true, model: got.model,
        ...(got.fet ? { fet: got.fet } : {}), ...(got.ct ? { ct: got.ct } : {}),
        intake: got.intake,
      },
    }));
    addNotification(`Aquifer taken from "${record.case.name}": ${AQUIFER_MODELS[got.model]}.`, 'success');
  };

  const edited = aquiferEditedKeys(aq);
  const fields = aq.model === 'fetkovich' ? FET_FIELDS : CT_FIELDS;
  const group = aq.model === 'fetkovich' ? 'fet' : 'ct';
  const it = aq.intake;
  return (
    <div className="space-y-3" data-testid="sim-aquifer">
      <label className="flex items-center gap-2 text-xs text-pl-text">
        <input type="checkbox" checked={!!aq.enabled} disabled={!canWrite} onChange={(e) => set({ enabled: e.target.checked })} data-testid="sim-aquifer-enabled" />
        <Waves className="w-3.5 h-3.5" /> An analytical aquifer joined to the grid
      </label>
      {aq.enabled && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[220px] flex-1">
              <Label htmlFor="sim-aquifer-case" className="text-[11px] text-pl-muted">From a Material Balance case (its last run)</Label>
              <select id="sim-aquifer-case" data-testid="sim-aquifer-case" value={caseId} onChange={(e) => setCaseId(e.target.value)} className={selectCls}>
                <option value="">{cases == null ? 'Loading the cases' : (cases.length ? 'Choose a case' : 'No Material Balance case')}</option>
                {caseId && named && !(cases || []).some((c) => c.id === caseId) && <option value={caseId}>Case named in the address</option>}
                {(cases || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!canWrite || !caseId || busy} onClick={take} data-testid="sim-aquifer-take">Take the aquifer</Button>
          </div>
          {message && <p className="text-[11px] text-pl-warning-text" data-testid="sim-aquifer-message">{message}</p>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sim-aquifer-model" className="text-[11px] text-pl-muted">Model</Label>
              <select id="sim-aquifer-model" data-testid="sim-aquifer-model" value={aq.model} disabled={!canWrite} onChange={(e) => set({ model: e.target.value })} className={selectCls}>
                {Object.entries(AQUIFER_MODELS).map(([k, w]) => <option key={k} value={k}>{w}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sim-aquifer-face" className="text-[11px] text-pl-muted">Joined to</Label>
              <select id="sim-aquifer-face" data-testid="sim-aquifer-face" value={aq.face} disabled={!canWrite} onChange={(e) => set({ face: e.target.value })} className={selectCls}>
                {Object.entries(AQUIFER_FACE_WORDS).map(([k, w]) => <option key={k} value={k}>{w}</option>)}
              </select>
            </div>
            {fields.map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`sim-aquifer-${key}`} className="text-[11px] text-pl-muted">{label}</Label>
                <Input id={`sim-aquifer-${key}`} data-testid={`sim-aquifer-${key}`} value={aq[group]?.[key] ?? ''} disabled={!canWrite} inputMode="decimal"
                  onChange={(e) => setField(group, key, e.target.value)} className="h-8 text-xs" />
                {it?.model === aq.model && it.sources?.[key] && <p className="text-[10px] text-pl-muted">{edited.includes(key) ? 'Edited here after the intake' : it.sources[key]}</p>}
              </div>
            ))}
          </div>
          {it && (
            <div className="rounded border border-pl-border bg-pl-sunken p-2 text-[11px] text-pl-muted space-y-1" data-testid="sim-aquifer-source">
              <p>From {it.from?.app || 'Material Balance Studio'} case &quot;{it.from?.recordName}&quot; (mbal-1), its run of {String(it.from?.ranAt || '').slice(0, 16).replace('T', ' ') || 'n/a'}, taken {String(it.from?.at || '').slice(0, 10)}{it.status === 'earlier_run' ? '; the case was changed after that run' : ''}.</p>
              {it.model !== aq.model && <p className="text-pl-warning-text">The model was changed here from the case&apos;s {AQUIFER_MODELS[it.model]}: the values are typed.</p>}
              {edited.length > 0 && it.model === aq.model && <p className="text-pl-warning-text">Edited after the intake: {edited.join(', ')}.</p>}
            </div>
          )}
          <p className="text-[11px] text-pl-muted">
            The aquifer starts at the equilibrium pressure at the datum. Carter-Tracy uses the Material Balance engine&apos;s own influence function (written as AQUTAB) and, because OPM Flow takes the aquifer water viscosity from PVTW, its permeability is written as k times the PVTW viscosity over the aquifer viscosity; the deck and the report say so.
          </p>
        </>
      )}
    </div>
  );
}
