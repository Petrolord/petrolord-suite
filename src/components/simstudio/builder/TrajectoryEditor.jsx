// Per-well trajectory editor (S4): paste MD/INC/AZI survey stations,
// place the wellhead in the grid frame, and preview the COMPDAT
// connections against the CURRENT grid (the generate step recomputes
// from the same inputs, so the preview can never go stale silently).
import React, { useState } from 'react';
import { Route, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { gridFromForm } from '@/utils/simDeckBuilder';
import { parseSurveyText, buildTrajectoryConnections } from '@/utils/simTrajectoryImport';

const Small = ({ label, value, onChange, className = 'w-24' }) => (
  <div className={`space-y-1 ${className}`}>
    <Label className="text-[11px] text-slate-400">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)}
      className="h-8 bg-slate-800 border-slate-700 text-xs" />
  </div>
);

const TrajectoryEditor = ({ form, wellIdx, set }) => {
  const well = form.wells[wellIdx];
  const traj = well.trajectory || { enabled: false };
  const [check, setCheck] = useState(null);

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
        kbToDatumFt: parseFloat(traj.kbToDatum) || 0,
      }, grid);
      setCheck({ ok: true, ...out });
    } catch (e) {
      setCheck({ ok: false, message: e.message });
    }
  };

  return (
    <div className="col-span-4 md:col-span-9 rounded-md border border-slate-800 bg-slate-950/40 p-3 space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[240px]">
          <Label className="text-[11px] text-slate-400">Survey stations — MD INC AZI per line ({traj.mdUnit === 'm' ? 'metres' : 'feet'}, grid azimuths)</Label>
          <textarea value={traj.text || ''} rows={4} spellCheck={false}
            onChange={(e) => patch({ text: e.target.value })}
            placeholder={'0 0 0\n8100 0 90\n8500 88 90\n10000 88 90'}
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs font-mono text-slate-200"
            data-testid={`trajectory-text-${wellIdx}`} />
        </div>
        <div className="space-y-1 w-20">
          <Label className="text-[11px] text-slate-400">MD unit</Label>
          <select value={traj.mdUnit || 'ft'} onChange={(e) => patch({ mdUnit: e.target.value })}
            className="w-full h-8 rounded-md bg-slate-800 border border-slate-700 px-1 text-xs">
            <option value="ft">ft</option>
            <option value="m">m</option>
          </select>
        </div>
        <Small label="Wellhead X (ft)" value={traj.wellheadX ?? ''} onChange={(v) => patch({ wellheadX: v })} />
        <Small label="Wellhead Y (ft)" value={traj.wellheadY ?? ''} onChange={(v) => patch({ wellheadY: v })} />
        <Small label="KB→datum (ft)" value={traj.kbToDatum ?? '0'} onChange={(v) => patch({ kbToDatum: v })} />
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={runCheck}
          data-testid={`trajectory-check-${wellIdx}`}>
          <Route className="w-3 h-3 mr-1" /> Check trajectory
        </Button>
      </div>
      {check && (check.ok ? (
        <p className="text-[11px] text-emerald-400 flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            {check.connections.length} connections, head I{check.headIJ.i} J{check.headIJ.j},
            {' '}{check.inGridFt} ft in zone (TVD {check.tvdRange.min}–{check.tvdRange.max} ft)
            {check.warnings.length > 0 && ` — ${check.warnings.join(' ')}`}
          </span>
        </p>
      ) : (
        <p className="text-[11px] text-amber-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {check.message}
        </p>
      ))}
      <p className="text-[11px] text-slate-500">
        X grows east with I from the grid corner, Y north with J; azimuths are grid-referenced.
        Deck depth = survey TVD + KB→datum. Connections are recomputed at generate time.
      </p>
    </div>
  );
};

export default TrajectoryEditor;
