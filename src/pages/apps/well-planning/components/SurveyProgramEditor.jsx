// Survey-program editor (WD4): assign a survey instrument to each MD
// interval of a design. Intervals live in wp_survey_programs (one row
// per design, metres); the uncertainty engine composites tool runs with
// the ISCWSA tie-on carry. Only validated tools from the engine tool
// library are offered.

import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { TOOL_LIBRARY } from '../engine/surveyProgram';
import { M_TO_FT } from '../engine/surveyMath';
import { validateProgramIntervals } from '../services/acUtils';
import { getSurveyProgram, upsertSurveyProgram } from '../services/wpApi';

const SurveyProgramEditor = ({
  open, onOpenChange, design, tdMdM, mdUnit = 'm', userId, onSaved,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);

  const toUser = (m) => (mdUnit === 'ft' ? m * M_TO_FT : m);
  const toMeters = (v) => (mdUnit === 'ft' ? v / M_TO_FT : v);

  useEffect(() => {
    if (!open || !design?.id) return;
    setLoading(true);
    setErrors([]);
    getSurveyProgram(design.id)
      .then((row) => {
        const intervals = Array.isArray(row?.intervals) && row.intervals.length
          ? row.intervals
          : [{
            from_md_m: 0,
            to_md_m: Number.isFinite(tdMdM) ? tdMdM : 0,
            toolcode: TOOL_LIBRARY[0].id,
          }];
        setRows(intervals.map((it) => ({
          from: +toUser(it.from_md_m).toFixed(1),
          to: +toUser(it.to_md_m).toFixed(1),
          toolcode: it.toolcode,
        })));
      })
      .catch((e) => toast({ variant: 'destructive', title: 'Failed to load survey program', description: e.message }))
      .finally(() => setLoading(false));
  }, [open, design?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (i, field, value) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    setRows((prev) => {
      const lastTo = prev.length ? Number(prev[prev.length - 1].to) : 0;
      const end = Number.isFinite(tdMdM) ? +toUser(tdMdM).toFixed(1) : lastTo;
      return [...prev, { from: lastTo, to: Math.max(end, lastTo), toolcode: TOOL_LIBRARY[0].id }];
    });
  };

  const removeRow = (i) => setRows((prev) => prev.filter((_, j) => j !== i));

  const handleSave = async () => {
    const check = validateProgramIntervals(
      rows.map((r) => ({
        from_md_m: toMeters(Number(r.from)),
        to_md_m: toMeters(Number(r.to)),
        toolcode: r.toolcode,
      })),
      { tdMdM },
    );
    setErrors(check.errors);
    if (!check.ok) return;
    setSaving(true);
    try {
      await upsertSurveyProgram(design.id, check.intervals, userId);
      toast({ title: 'Survey program saved', className: 'bg-green-600 text-white' });
      onSaved?.(check.intervals);
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Survey program — {design?.name}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Instrument per MD interval ({mdUnit}). Intervals must tile the design from surface
            {Number.isFinite(tdMdM) ? ` to TD (${toUser(tdMdM).toFixed(0)} ${mdUnit})` : ''} with no gaps.
            Positional uncertainty freezes at each tool change (ISCWSA tie-on).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_2fr_28px] gap-2 text-[10px] uppercase text-slate-500 font-bold">
              <span>From ({mdUnit})</span><span>To ({mdUnit})</span><span>Instrument</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_2fr_28px] gap-2 items-center">
                <Input type="number" value={r.from} onChange={(e) => update(i, 'from', e.target.value)}
                  className="h-8 bg-slate-800 border-slate-700 text-xs" />
                <Input type="number" value={r.to} onChange={(e) => update(i, 'to', e.target.value)}
                  className="h-8 bg-slate-800 border-slate-700 text-xs" />
                <Select value={r.toolcode} onValueChange={(v) => update(i, 'toolcode', v)}>
                  <SelectTrigger className="h-8 bg-slate-800 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 text-white">
                    {TOOL_LIBRARY.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => removeRow(i)}
                  className="h-7 w-7 text-slate-600 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={addRow} className="h-7 text-xs text-lime-400 hover:bg-slate-800">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add interval
            </Button>
            {errors.length > 0 && (
              <ul className="rounded-md border border-red-900/40 bg-red-900/15 px-3 py-2 text-xs text-red-300 space-y-0.5">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            <p className="text-[10px] text-slate-500">
              Tool library ships only oracle-validated instruments (ISCWSA MWD Rev4 today);
              gyro and corrected-MWD models arrive with their validation gates.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 text-slate-300">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading} className="bg-[#4CAF50] hover:bg-[#43a047] text-white">
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Save program
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SurveyProgramEditor;
