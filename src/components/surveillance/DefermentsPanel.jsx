// Downtime and deferment capture (Deferments tab). Events are spine
// rows (po_deferments) with the fixed cause taxonomy; the rollup is
// summarizeDeferments, which accrues open events to the field's latest
// ledger date rather than to today's wall clock.
import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { DEFERMENT_CATEGORIES } from '@/lib/productionSpine';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

const CATEGORY_LABEL = (c) => c.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
const fmt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '0');
const today = () => new Date().toISOString().slice(0, 10);

const blankEvent = () => ({
  wellId: '', startDate: today(), endDate: '', category: 'well', cause: '',
  oilDeferredStb: '', waterDeferredStb: '', gasDeferredMscf: '', comment: '',
});

const AddDefermentDialog = () => {
  const { wells, addDeferment, addNotification } = useSurveillance();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankEvent);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!form.wellId) { addNotification('Pick the well the deferment applies to', 'error'); return; }
    if (!form.startDate) { addNotification('A start date is required', 'error'); return; }
    if (form.endDate && form.endDate < form.startDate) {
      addNotification('The end date cannot precede the start date', 'error');
      return;
    }
    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    addDeferment(form.wellId, {
      startDate: form.startDate,
      endDate: form.endDate || null,
      category: form.category,
      cause: form.cause.trim() || null,
      oilDeferredStb: num(form.oilDeferredStb),
      waterDeferredStb: num(form.waterDeferredStb),
      gasDeferredMscf: num(form.gasDeferredMscf),
      comment: form.comment.trim() || null,
    });
    setForm(blankEvent());
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={wells.length === 0}>
          <Plus className="w-4 h-4 mr-1" /> Record deferment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record a deferment</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-[65vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label className="text-xs text-pl-muted">Well</Label>
            <Select value={form.wellId} onValueChange={(v) => set('wellId', v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select well" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {wells.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">Start date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)}
                className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">End date (blank if ongoing)</Label>
              <Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)}
                className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-pl-muted">Category</Label>
            <Select value={form.category} onValueChange={(v) => set('category', v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEFERMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABEL(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-pl-muted">Cause</Label>
            <Input placeholder="ESP failure, flowline leak, scheduled shutdown" value={form.cause}
              onChange={(e) => set('cause', e.target.value)} className="h-9" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">Oil deferred (stb)</Label>
              <Input type="number" value={form.oilDeferredStb} onChange={(e) => set('oilDeferredStb', e.target.value)}
                className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">Water (stb)</Label>
              <Input type="number" value={form.waterDeferredStb} onChange={(e) => set('waterDeferredStb', e.target.value)}
                className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">Gas (Mscf)</Label>
              <Input type="number" value={form.gasDeferredMscf} onChange={(e) => set('gasDeferredMscf', e.target.value)}
                className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-pl-muted">Comment</Label>
            <Textarea rows={2} value={form.comment} onChange={(e) => set('comment', e.target.value)}
              />
          </div>
        </div>
        <DialogFooter><Button onClick={submit}>Save deferment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DefermentsPanel = () => {
  const {
    deferments, defermentSummary, canEditField, currentField,
    closeDeferment, removeDeferment, surveillance,
  } = useSurveillance();

  if (!currentField) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-pl-muted text-sm">
          Select a field in the left rail to record downtime against its wells.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">
            Deferment events <span className="text-pl-muted font-normal">({deferments.length})</span>
          </CardTitle>
          {canEditField && <AddDefermentDialog />}
        </CardHeader>
        <CardContent>
          {deferments.length === 0 ? (
            <p className="text-sm text-pl-muted">
              No deferments recorded. Log downtime as it happens and the rollup below turns it into
              a loss profile by cause.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-pl-muted border-b border-pl-border">
                    <th className="py-2 pr-3 font-semibold">Well</th>
                    <th className="py-2 pr-3 font-semibold">Period</th>
                    <th className="py-2 pr-3 font-semibold">Category</th>
                    <th className="py-2 pr-3 font-semibold">Cause</th>
                    <th className="py-2 pr-3 font-semibold text-right">Oil (stb)</th>
                    <th className="py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {deferments.map((d) => (
                    <tr key={d.id} className="border-b border-pl-border last:border-0">
                      <td className="py-2 pr-3 text-pl-text">{d.well?.name}</td>
                      <td className="py-2 pr-3 text-pl-muted text-xs">
                        {d.start_date} to {d.end_date || <span className="text-pl-warning-text">open</span>}
                      </td>
                      <td className="py-2 pr-3 text-pl-muted">{CATEGORY_LABEL(d.category)}</td>
                      <td className="py-2 pr-3 text-pl-muted text-xs max-w-[16rem] truncate" title={d.comment || d.cause || ''}>
                        {d.cause || '--'}
                      </td>
                      <td className="py-2 pr-3 text-right text-pl-text">{fmt(d.oil_deferred_stb)}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {canEditField && (
                          <>
                            {!d.end_date && (
                              <Button
                                variant="ghost" size="sm" className="h-7 px-2 text-xs text-pl-primary-text"
                                title="Close this event as of today"
                                onClick={() => closeDeferment(d.id, surveillance.asOf || today())}
                              >
                                <CheckCircle2 size={14} className="mr-1" /> Close
                              </Button>
                            )}
                            <Button
                              variant="ghost" size="sm" className="h-7 px-2 text-pl-muted hover:text-pl-danger-text"
                              title="Delete this event"
                              onClick={() => {
                                if (window.confirm('Delete this deferment event?')) removeDeferment(d.id);
                              }}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {defermentSummary.ok === false && defermentSummary.note && (
        <p className="text-[11px] text-pl-muted">{defermentSummary.note}</p>
      )}

      {defermentSummary.byCategory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Loss by cause</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-pl-muted border-b border-pl-border">
                    <th className="py-2 pr-3 font-semibold">Category</th>
                    <th className="py-2 pr-3 font-semibold text-right">Events</th>
                    <th className="py-2 pr-3 font-semibold text-right">Event days</th>
                    <th className="py-2 pr-3 font-semibold text-right">Oil (stb)</th>
                    <th className="py-2 pr-3 font-semibold text-right">Water (stb)</th>
                    <th className="py-2 font-semibold text-right">Gas (Mscf)</th>
                  </tr>
                </thead>
                <tbody>
                  {defermentSummary.byCategory.map((c) => (
                    <tr key={c.category} className="border-b border-pl-border">
                      <td className="py-2 pr-3 text-pl-text">{CATEGORY_LABEL(c.category)}</td>
                      <td className="py-2 pr-3 text-right text-pl-muted">{c.events}</td>
                      <td className="py-2 pr-3 text-right text-pl-muted">{fmt(c.days)}</td>
                      <td className="py-2 pr-3 text-right font-pl-mono tabular-nums text-pl-text">{fmt(c.oil)}</td>
                      <td className="py-2 pr-3 text-right font-pl-mono tabular-nums text-pl-text">{fmt(c.water)}</td>
                      <td className="py-2 text-right font-pl-mono tabular-nums text-pl-text">{fmt(c.gas)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3 text-pl-text">Total</td>
                    <td className="py-2 pr-3 text-right text-pl-text">{defermentSummary.totals.events}</td>
                    <td className="py-2 pr-3 text-right text-pl-text">{fmt(defermentSummary.totals.days)}</td>
                    <td className="py-2 pr-3 text-right text-pl-text">{fmt(defermentSummary.totals.oil)}</td>
                    <td className="py-2 pr-3 text-right text-pl-text">{fmt(defermentSummary.totals.water)}</td>
                    <td className="py-2 text-right text-pl-text">{fmt(defermentSummary.totals.gas)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-pl-muted flex items-center gap-1.5">
              <CircleDot size={12} className="text-pl-warning-text" />
              {defermentSummary.openCount} open event{defermentSummary.openCount === 1 ? '' : 's'} accrue days to
              {' '}{surveillance.asOf}, the latest date in the ledger.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DefermentsPanel;
