// Per-well trajectory editor (S4): paste MD/INC/AZI survey stations,
// place the wellhead in the grid frame, and preview the COMPDAT
// connections against the CURRENT grid (the generate step recomputes
// from the same inputs, so the preview can never go stale silently).
import React, { useEffect, useState } from 'react';
import { Route, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { gridFromForm } from '@/utils/simDeckBuilder';
import { parseSurveyText, buildTrajectoryConnections } from '@/utils/simTrajectoryImport';
import { listWells } from '@/lib/wellsRegistry';
import { readWellDatum, DEPTH_REF_KINDS, DEPTH_REF_LABELS } from '@/lib/wellDatum';
import { M_PER_FT } from '@/lib/units/registry';

const Small = ({ label, value, onChange, className = 'w-24' }) => (
  <div className={`space-y-1 ${className}`}>
    <Label className="text-[11px] text-pl-muted">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)}
      className="h-8 text-xs" />
  </div>
);

// SIM-U1-013: the survey's depth reference comes from the well datum module
// (src/lib/wellDatum.js), or is typed with its kind. The survey TVD is below
// that reference; deck depths are TVDSS, so deck depth = TVD - elevation.
// This replaces the builder's own "KB to datum" shift (a saved form's shift
// s becomes elevation -s, migrateBuilderForm).
function useRegistryWells() {
  const [wells, setWells] = useState(null);
  useEffect(() => {
    let alive = true;
    listWells().then((rows) => { if (alive) setWells(rows || []); }).catch(() => { if (alive) setWells([]); });
    return () => { alive = false; };
  }, []);
  return wells;
}

const TrajectoryEditor = ({ form, wellIdx, set, u = null }) => {
  const well = form.wells[wellIdx];
  const traj = well.trajectory || { enabled: false };
  const [check, setCheck] = useState(null);
  const [datumNote, setDatumNote] = useState('');
  const registry = useRegistryWells();
  const lenLabel = u ? u.label('length') : 'ft';
  const elevShown = u ? u.text('length', traj.refElevFt ?? '') : (traj.refElevFt ?? '');

  const fromRegistry = (id) => {
    const row = (registry || []).find((w) => String(w.id) === String(id));
    if (!row) return;
    const d = readWellDatum(row);
    if (!d.tvdssOk || d.refElevM == null) {
      setDatumNote(d.tvdssReason || 'This well has no depth reference elevation in the registry.');
      return;
    }
    setDatumNote(d.note || '');
    set(`wells.${wellIdx}.trajectory`, {
      ...traj, refKind: d.refKind || 'KB', refElevFt: String(parseFloat((d.refElevM / M_PER_FT).toPrecision(8))),
      datumSource: 'registry', wellId: row.id, wellName: row.name || '',
    });
    setCheck(null);
  };

  const patch = (fields) => {
    set(`wells.${wellIdx}.trajectory`, { ...traj, ...fields });
    setCheck(null);
  };

  const runCheck = () => {
    try {
      const grid = gridFromForm(form);
      const { stations, errors } = parseSurveyText(traj.text);
      if (errors.length) throw new Error(errors[0]);
      const out = buildTrajectoryConnections({
        stations,
        mdUnit: traj.mdUnit === 'm' ? 'm' : 'ft',
        wellheadX: parseFloat(traj.wellheadX),
        wellheadY: parseFloat(traj.wellheadY),
        kbToDatumFt: -(parseFloat(traj.refElevFt) || 0),
      }, grid);
      setCheck({ ok: true, ...out });
    } catch (e) {
      setCheck({ ok: false, message: e.message });
    }
  };

  return (
    <div className="col-span-4 md:col-span-9 rounded-md border border-pl-border bg-pl-sunken p-3 space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[240px]">
          <Label className="text-[11px] text-pl-muted">Survey stations: MD INC AZI per line ({traj.mdUnit === 'm' ? 'metres' : 'feet'}, grid azimuths)</Label>
          <textarea value={traj.text || ''} rows={4} spellCheck={false}
            onChange={(e) => patch({ text: e.target.value })}
            placeholder={'0 0 0\n8100 0 90\n8500 88 90\n10000 88 90'}
            className="w-full rounded-md border border-pl-border-strong bg-pl-surface px-2 py-1 text-xs font-mono text-pl-text"
            data-testid={`trajectory-text-${wellIdx}`} />
        </div>
        <div className="space-y-1 w-20">
          <Label className="text-[11px] text-pl-muted">MD unit</Label>
          <select value={traj.mdUnit || 'ft'} onChange={(e) => patch({ mdUnit: e.target.value })}
            className="w-full h-8 rounded-md border border-pl-border-strong bg-pl-surface px-1 text-xs text-pl-text">
            <option value="ft">ft</option>
            <option value="m">m</option>
          </select>
        </div>
        <Small label="Wellhead X (ft)" value={traj.wellheadX ?? ''} onChange={(v) => patch({ wellheadX: v })} />
        <Small label="Wellhead Y (ft)" value={traj.wellheadY ?? ''} onChange={(v) => patch({ wellheadY: v })} />
        <div className="space-y-1 w-28">
          <Label className="text-[11px] text-pl-muted">Depth reference</Label>
          <select value={traj.refKind || 'KB'} onChange={(e) => patch({ refKind: e.target.value, datumSource: 'entered' })}
            className="w-full h-8 rounded-md border border-pl-border-strong bg-pl-surface px-1 text-xs text-pl-text" data-testid={`trajectory-refkind-${wellIdx}`}>
            {DEPTH_REF_KINDS.map((k) => <option key={k} value={k} title={DEPTH_REF_LABELS[k]}>{k}</option>)}
          </select>
        </div>
        <Small label={`Its elevation above the datum (${lenLabel})`} className="w-36" value={elevShown}
          onChange={(v) => { const st = u ? u.toState('length', v) : v; if (st !== null) patch({ refElevFt: st, datumSource: 'entered' }); }} />
        <div className="space-y-1 w-44">
          <Label className="text-[11px] text-pl-muted">or from the wells registry</Label>
          <select value={traj.datumSource === 'registry' ? String(traj.wellId) : ''} onChange={(e) => fromRegistry(e.target.value)}
            className="w-full h-8 rounded-md border border-pl-border-strong bg-pl-surface px-1 text-xs text-pl-text" data-testid={`trajectory-registry-${wellIdx}`}>
            <option value="">{registry == null ? 'Loading wells' : registry.length ? 'Pick a registry well' : 'No registry wells'}</option>
            {(registry || []).map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
          </select>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={runCheck}
          data-testid={`trajectory-check-${wellIdx}`}>
          <Route className="w-3 h-3 mr-1" /> Check trajectory
        </Button>
      </div>
      {check && (check.ok ? (
        <p className="text-[11px] text-pl-success-text flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            {check.connections.length} connections, head I{check.headIJ.i} J{check.headIJ.j},
            {' '}{check.inGridFt} ft in zone (TVD {check.tvdRange.min}–{check.tvdRange.max} ft)
            {check.warnings.length > 0 && `. ${check.warnings.join(' ')}`}
          </span>
        </p>
      ) : (
        <p className="text-[11px] text-pl-warning-text flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {check.message}
        </p>
      ))}
      {datumNote && <p className="text-[11px] text-pl-warning-text">{datumNote}</p>}
      <p className="text-[11px] text-pl-muted">
        X grows east with I from the grid corner, Y north with J; azimuths are grid-referenced. The survey TVD is below
        the depth reference ({traj.refKind || 'KB'}{traj.datumSource === 'registry' ? `, from the registry well ${traj.wellName}` : ', typed'});
        deck depth (TVDSS) = TVD minus its elevation above the datum. Connections are recomputed at generate time.
      </p>
    </div>
  );
};

export default TrajectoryEditor;
