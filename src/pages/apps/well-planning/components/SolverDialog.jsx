// Design-method solver launcher (WD2). Five methods on the validated
// engines/drilling profileDesign solvers. Whole-well profiles (slant,
// S, nudge) REPLACE the segment list from a vertical tie-on; curve to
// target and horizontal landing APPEND from the current design end.

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  solveSlant, solveSProfile, solveContinuousBuild,
  solveHorizontalLanding, solveNudge, solveNudgeInverse,
} from '../engine/profileDesign';

const METHODS = [
  { id: 'slant', label: 'Build and hold (J)', mode: 'replace' },
  { id: 's', label: 'S-profile (build, hold, drop)', mode: 'replace' },
  { id: 'continuous', label: 'Curve to target (single arc)', mode: 'append' },
  { id: 'horizontal', label: 'Horizontal landing (curve-hold-curve)', mode: 'append' },
  { id: 'nudge', label: 'Nudge (slot separation)', mode: 'replace' },
];

const toUiSegments = (engineSegments) => engineSegments.map((s, i) => {
  const id = `sol-${Date.now()}-${i}`;
  if (s.kind === 'hold') return { id, type: 'Hold', length: +s.length.toFixed(2), buildRate: 0, turnRate: 0 };
  if (s.kind === 'build') return { id, type: 'Build', length: +s.length.toFixed(2), buildRate: +s.rate.toFixed(4), turnRate: 0 };
  return {
    id, type: 'ToolfaceArc', length: +s.length.toFixed(2),
    dls: +s.dls.toFixed(4), toolface: +s.toolfaceDeg.toFixed(2), buildRate: 0, turnRate: 0,
  };
});

const NumField = ({ label, value, onChange, step = 'any', testid }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <Input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 bg-slate-800 border-slate-700" data-testid={testid} />
  </div>
);

const SolverDialog = ({
  open, onOpenChange, targets = [], wellbore, mdUnit, kbM = 0,
  metersToUser, currentEnd, onApply,
}) => {
  const { toast } = useToast();
  const [method, setMethod] = useState('slant');
  const [targetId, setTargetId] = useState('');
  const [p, setP] = useState({
    kop: mdUnit === 'ft' ? 1000 : 300,
    buildRate: 3, dropRate: 2, finalInc: 0,
    landAzi: '', rate1: 3, rate2: 3,
    nudgeInc: 10, nudgeAzi: 0, nudgeHold: 100,
    nudgeMode: 'forward', nudgeOffset: 50, nudgeVertical: 500,
  });
  const set = (k) => (v) => setP((f) => ({ ...f, [k]: v }));

  const intervalLabel = mdUnit === 'ft' ? '100ft' : '30m';
  const methodDef = METHODS.find((m) => m.id === method);
  const needsTarget = method !== 'nudge';
  const target = targets.find((t) => t.id === targetId);

  // Target displacement in the wellbore's depth unit, relative either
  // to the wellhead (replace modes) or to the current design end
  // (append modes).
  const delta = useMemo(() => {
    if (!target || !wellbore) return null;
    const dEm = (target.center_x || 0) - (wellbore.head_x || 0);
    const dNm = (target.center_y || 0) - (wellbore.head_y || 0);
    const tvdM = (target.tvdss_m || 0) + (kbM || 0); // below KB
    const base = {
      dE: metersToUser(dEm), dN: metersToUser(dNm), dTvd: metersToUser(tvdM),
    };
    if (methodDef.mode === 'append' && currentEnd) {
      return {
        dE: base.dE - currentEnd.e,
        dN: base.dN - currentEnd.n,
        dTvd: base.dTvd - currentEnd.tvd,
      };
    }
    return base;
  }, [target, wellbore, kbM, metersToUser, methodDef.mode, currentEnd]);

  const handleSolve = () => {
    try {
      if (needsTarget && !target) throw new Error('Select a target first.');
      let sol;
      let kickoffAzi = null;
      let mode = methodDef.mode;

      if (method === 'slant') {
        const kop = parseFloat(p.kop) || 0;
        sol = solveSlant({
          target: { ...delta, dTvd: delta.dTvd - kop },
          buildRate: parseFloat(p.buildRate), mdUnit,
        });
        if (sol.feasible) {
          sol = { ...sol, segments: [{ kind: 'hold', length: kop }, ...sol.segments] };
          kickoffAzi = sol.report.aziDeg;
        }
      } else if (method === 's') {
        sol = solveSProfile({
          kopLen: parseFloat(p.kop) || 0,
          buildRate: parseFloat(p.buildRate),
          dropRate: parseFloat(p.dropRate),
          finalIncDeg: parseFloat(p.finalInc) || 0,
          target: delta, mdUnit,
        });
        if (sol.feasible) kickoffAzi = sol.report.aziDeg;
      } else if (method === 'continuous') {
        if (!currentEnd) throw new Error('Design something first: the arc starts from the current design end.');
        sol = solveContinuousBuild({
          tieOn: { inc: currentEnd.inc, azi: currentEnd.azi },
          delta, mdUnit,
        });
      } else if (method === 'horizontal') {
        if (!currentEnd) throw new Error('Design something first (for example a vertical hold to the kickoff): the landing starts from the current design end.');
        const landAzi = p.landAzi === '' ? null : parseFloat(p.landAzi);
        sol = solveHorizontalLanding({
          tieOn: { inc: currentEnd.inc, azi: currentEnd.azi },
          landing: {
            ...delta,
            incDeg: 90,
            aziDeg: landAzi == null
              ? (Math.atan2(delta.dE, delta.dN) * 180 / Math.PI + 360) % 360
              : landAzi,
          },
          rate1: parseFloat(p.rate1), rate2: parseFloat(p.rate2), mdUnit,
        });
      } else if (method === 'nudge') {
        sol = p.nudgeMode === 'forward'
          ? solveNudge({
            nudgeIncDeg: parseFloat(p.nudgeInc), nudgeAziDeg: parseFloat(p.nudgeAzi) || 0,
            holdLen: parseFloat(p.nudgeHold) || 0,
            buildRate: parseFloat(p.buildRate), dropRate: parseFloat(p.dropRate), mdUnit,
          })
          : solveNudgeInverse({
            offset: parseFloat(p.nudgeOffset), verticalLen: parseFloat(p.nudgeVertical),
            buildRate: parseFloat(p.buildRate), dropRate: parseFloat(p.dropRate), mdUnit,
          });
        if (sol.feasible) kickoffAzi = parseFloat(p.nudgeAzi) || 0;
      }

      if (!sol.feasible) throw new Error(sol.error || 'No solution.');
      onApply({ segments: toUiSegments(sol.segments), kickoffAzi, mode, report: sol.report, method: methodDef.label });
      const r = sol.report;
      toast({
        title: 'Solve complete',
        description: r.holdIncDeg != null
          ? `Hold inclination ${r.holdIncDeg.toFixed(1)} deg at azimuth ${(r.aziDeg ?? 0).toFixed(1)} deg.`
          : r.holdInc != null
            ? `Hold ${r.holdInc.toFixed(1)} deg / ${r.holdAzi.toFixed(1)} deg, landing at ${r.landInc.toFixed(0)} deg.`
            : 'Segments added to the design.',
        className: 'bg-green-600 text-white',
      });
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Solver', description: e.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Design method</DialogTitle>
          <DialogDescription className="text-slate-400">
            Whole-well profiles replace the segment list; curve-to-target and horizontal landing extend the design from its current end.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {METHODS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {needsTarget && (
            <div>
              <Label className="text-xs">Target</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700" data-testid="solver-target-trigger"><SelectValue placeholder="Select target..." /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {targets.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.tvdss_m?.toFixed(0)} m TVDSS)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {method === 'slant' && (
            <div className="grid grid-cols-2 gap-3">
              <NumField label={`KOP (${mdUnit})`} value={p.kop} onChange={set('kop')} testid="solver-kop" />
              <NumField label={`Build rate (deg/${intervalLabel})`} value={p.buildRate} onChange={set('buildRate')} testid="solver-buildrate" />
            </div>
          )}
          {method === 's' && (
            <div className="grid grid-cols-2 gap-3">
              <NumField label={`KOP (${mdUnit})`} value={p.kop} onChange={set('kop')} />
              <NumField label={`Build rate (deg/${intervalLabel})`} value={p.buildRate} onChange={set('buildRate')} />
              <NumField label={`Drop rate (deg/${intervalLabel})`} value={p.dropRate} onChange={set('dropRate')} />
              <NumField label="Final inclination (deg)" value={p.finalInc} onChange={set('finalInc')} />
            </div>
          )}
          {method === 'continuous' && (
            <p className="text-xs text-slate-400">
              One exact arc from the current design end to the target. The required dogleg and toolface are computed; the design fails loudly if the target lies behind the hole direction.
            </p>
          )}
          {method === 'horizontal' && (
            <div className="grid grid-cols-2 gap-3">
              <NumField label={`Curve 1 rate (deg/${intervalLabel})`} value={p.rate1} onChange={set('rate1')} />
              <NumField label={`Curve 2 rate (deg/${intervalLabel})`} value={p.rate2} onChange={set('rate2')} />
              <div className="col-span-2">
                <NumField label="Landing azimuth (deg, blank = toward target)" value={p.landAzi} onChange={set('landAzi')} />
              </div>
            </div>
          )}
          {method === 'nudge' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Mode</Label>
                <Select value={p.nudgeMode} onValueChange={set('nudgeMode')}>
                  <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="forward">Specify inclination and hold</SelectItem>
                    <SelectItem value="inverse">Solve from offset and vertical budget</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {p.nudgeMode === 'forward' ? (
                  <>
                    <NumField label="Nudge inclination (deg)" value={p.nudgeInc} onChange={set('nudgeInc')} />
                    <NumField label={`Nudge hold (${mdUnit})`} value={p.nudgeHold} onChange={set('nudgeHold')} />
                  </>
                ) : (
                  <>
                    <NumField label={`Lateral offset (${mdUnit})`} value={p.nudgeOffset} onChange={set('nudgeOffset')} />
                    <NumField label={`Vertical budget (${mdUnit})`} value={p.nudgeVertical} onChange={set('nudgeVertical')} />
                  </>
                )}
                <NumField label="Nudge azimuth (deg)" value={p.nudgeAzi} onChange={set('nudgeAzi')} />
                <NumField label={`Build rate (deg/${intervalLabel})`} value={p.buildRate} onChange={set('buildRate')} />
                <NumField label={`Drop rate (deg/${intervalLabel})`} value={p.dropRate} onChange={set('dropRate')} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600 text-slate-300">Cancel</Button>
          <Button onClick={handleSolve} className="bg-lime-600 hover:bg-lime-700 text-white" data-testid="solver-apply">Solve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SolverDialog;
