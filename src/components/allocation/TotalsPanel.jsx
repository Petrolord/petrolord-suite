// Metered field totals: import, manual entry and the register (Data
// tab). These are po_field_totals rows — the measurement the wells are
// allocated FROM, kept deliberately separate from the per-well ledger.
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Download, Trash2, FileWarning, Gauge, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { parseFieldTotalsCSV, fieldTotalsTemplateCSV } from '@/utils/production/csvImport';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const fmt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '0');

const download = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const AddTotalDialog = () => {
  const { saveTotal } = useAllocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10), oil: '', water: '', gas: '',
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };

  const submit = () => {
    if (!form.date) return;
    saveTotal({
      date: form.date, oil_stb: num(form.oil), water_stb: num(form.water), gas_mscf: num(form.gas),
      source: 'manual',
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" /> Add date</Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
        <DialogHeader><DialogTitle>Metered total for one date</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Date</Label>
            <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)}
              className="h-9 bg-slate-800 border-slate-700" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Oil (stb)</Label>
              <Input type="number" value={form.oil} onChange={(e) => set('oil', e.target.value)}
                className="h-9 bg-slate-800 border-slate-700" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Water (stb)</Label>
              <Input type="number" value={form.water} onChange={(e) => set('water', e.target.value)}
                className="h-9 bg-slate-800 border-slate-700" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Gas (Mscf)</Label>
              <Input type="number" value={form.gas} onChange={(e) => set('gas', e.target.value)}
                className="h-9 bg-slate-800 border-slate-700" />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Saving a date that already exists overwrites it.
          </p>
        </div>
        <DialogFooter><Button onClick={submit}>Save total</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const TotalsPanel = () => {
  const {
    currentField, canEditField, fieldTotals, importTotals, deleteTotal, addNotification,
  } = useAllocation();
  const [report, setReport] = useState(null);

  const handleText = (text) => {
    const { rows, report: r } = parseFieldTotalsCSV(text);
    setReport(r);
    if (!rows.length) {
      addNotification(r.warnings[0] || 'No usable rows in the file', 'error');
      return;
    }
    importTotals(rows);
  };

  const onDrop = (accepted) => {
    const file = accepted?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleText(String(ev.target.result));
    reader.readAsText(file);
  };

  const disabled = !currentField || !canEditField;
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] }, maxFiles: 1, disabled,
  });

  const recent = [...fieldTotals].reverse().slice(0, 60);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="w-4 h-4 text-sky-400" /> Metered field totals
          <span className="text-xs font-normal text-slate-500">
            {fieldTotals.length.toLocaleString()} date{fieldTotals.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          {!disabled && <AddTotalDialog />}
          <Button variant="outline" size="sm" disabled={disabled}
            onClick={() => handleText(fieldTotalsTemplateCSV())}>
            Sample data
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => download(fieldTotalsTemplateCSV(), 'po_field_totals_template.csv')}>
            <Download className="w-4 h-4 mr-1" /> Template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!currentField && (
          <p className="text-sm text-slate-400">
            Select a field in the left rail. Allocation needs its wells and ledger, which the
            Surveillance Studio imports, plus the metered totals below.
          </p>
        )}
        {currentField && !canEditField && (
          <p className="text-sm text-slate-400">
            This field is shared with you read-only. You can run and read allocations; only its
            owner can import totals or write factors back.
          </p>
        )}

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${
            disabled ? 'border-slate-800 opacity-50 cursor-not-allowed'
              : isDragActive ? 'border-sky-500 bg-sky-500/10 cursor-pointer'
                : 'border-slate-700 hover:border-slate-500 cursor-pointer'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-5 h-5 mx-auto text-slate-500 mb-2" />
          <p className="text-sm text-slate-400">
            Drop a meter CSV here, or click to browse. One row per date, no well column.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Recognized columns (aliases welcome): date, oil, water, gas. Units auto-scale from the
            header (Mscf/MMscf, bbl/Mbbl). Re-importing a corrected file overwrites the same dates.
          </p>
        </div>

        {report && (report.skipped.length > 0 || report.warnings.length > 0) && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 space-y-1">
            <div className="flex items-center gap-2 font-semibold"><FileWarning className="w-4 h-4" /> Import report</div>
            {report.warnings.map((w, i) => <div key={`w${i}`}>{w}</div>)}
            {report.skipped.slice(0, 8).map((s, i) => <div key={`s${i}`}>Row {s.row}: {s.reason}</div>)}
            {report.skipped.length > 8 && <div>...and {report.skipped.length - 8} more skipped rows.</div>}
          </div>
        )}

        {fieldTotals.length > 0 && (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold text-right">Oil (stb)</th>
                  <th className="py-2 pr-3 font-semibold text-right">Water (stb)</th>
                  <th className="py-2 pr-3 font-semibold text-right">Gas (Mscf)</th>
                  <th className="py-2 pr-3 font-semibold">Source</th>
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="py-1.5 pr-3 text-slate-200">{t.total_date}</td>
                    <td className="py-1.5 pr-3 text-right text-emerald-400">{fmt(t.oil_stb)}</td>
                    <td className="py-1.5 pr-3 text-right text-sky-400">{fmt(t.water_stb)}</td>
                    <td className="py-1.5 pr-3 text-right text-amber-400">{fmt(t.gas_mscf)}</td>
                    <td className="py-1.5 pr-3 text-slate-500 text-xs">{t.source}</td>
                    <td className="py-1.5 text-right">
                      {canEditField && (
                        <Button
                          variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-red-400"
                          onClick={() => deleteTotal(t.id)} title="Delete this metered date"
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fieldTotals.length > recent.length && (
              <p className="text-[11px] text-slate-500 pt-2">
                Showing the most recent {recent.length} of {fieldTotals.length.toLocaleString()} dates.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TotalsPanel;
