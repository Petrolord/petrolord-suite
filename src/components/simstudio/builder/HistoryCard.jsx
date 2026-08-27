// History card (S4): import Material Balance Studio production
// (rb_production_data cumulatives) as the deck's WCONHIST phase, with
// per-producer allocation and an optional prediction tail. The observed
// rates come back on the Results tab as dashed overlays (history match).
import React, { useEffect, useMemo, useState } from 'react';
import { History, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listMbalCases, listMbalProductionRows } from '@/lib/simService';
import { historyFromRbRows, historyPreviewRows } from '@/utils/simHistoryImport';

const HistoryCard = ({ form, set, addNotification }) => {
  const [cases, setCases] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [fracs, setFracs] = useState({});
  const history = form.history || { enabled: false };

  const producers = useMemo(
    () => form.wells.filter((w) => w.type === 'producer').map((w) => String(w.name || '').trim().toUpperCase()),
    [form.wells],
  );
  const waterInjectors = useMemo(
    () => form.wells.filter((w) => w.type === 'water_injector').map((w) => String(w.name || '').trim().toUpperCase()),
    [form.wells],
  );
  const gasInjectors = useMemo(
    () => form.wells.filter((w) => w.type === 'gas_injector').map((w) => String(w.name || '').trim().toUpperCase()),
    [form.wells],
  );

  useEffect(() => {
    if (!history.enabled || cases !== null) return;
    listMbalCases()
      .then(setCases)
      .catch((e) => {
        setCases([]);
        addNotification(e.message, 'error');
      });
  }, [history.enabled, cases, addNotification]);

  const fracOf = (name, count) => {
    const v = parseFloat(fracs[name]);
    return Number.isFinite(v) ? v : 1 / count;
  };

  const importHistory = async () => {
    const rbCase = (cases || []).find((c) => c.id === selectedId);
    if (!rbCase) return;
    setBusy(true);
    try {
      const rows = await listMbalProductionRows(rbCase.id);
      const out = historyFromRbRows(rows, {
        producers: producers.map((name) => ({ name, frac: fracOf(name, producers.length) })),
        waterInjectors: waterInjectors.map((name) => ({ name, frac: 1 / Math.max(1, waterInjectors.length) })),
        gasInjectors: gasInjectors.map((name) => ({ name, frac: 1 / Math.max(1, gasInjectors.length) })),
      }, { fallbackStartDate: form.startDate });
      set('history', {
        ...history,
        caseName: rbCase.name,
        startDate: out.startDate,
        endDate: out.endDate,
        periods: out.periods,
      });
      out.warnings.forEach((w) => addNotification(w, 'info'));
      addNotification(`History imported: ${out.periods.length} periods, ${out.startDate} → ${out.endDate}`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const preview = history.periods ? historyPreviewRows(history) : [];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" /> Production history (Material Balance Studio)
        </CardTitle>
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <input type="checkbox" checked={!!history.enabled} data-testid="history-enabled"
            onChange={(e) => set('history', { ...history, enabled: e.target.checked })} />
          Simulate observed history first
        </label>
      </CardHeader>
      {history.enabled && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[220px]">
              <Label className="text-[11px] text-slate-400">MBAL case</Label>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                className="w-full h-8 rounded-md bg-slate-800 border border-slate-700 px-2 text-xs"
                data-testid="history-case-select">
                <option value="">{cases === null ? 'Loading…' : cases.length ? 'Pick a case…' : 'No Material Balance cases found'}</option>
                {(cases || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {producers.length > 1 && producers.map((name) => (
              <div key={name} className="space-y-1 w-24">
                <Label className="text-[11px] text-slate-400">{name} frac</Label>
                <Input value={fracs[name] ?? (1 / producers.length).toFixed(2)}
                  onChange={(e) => setFracs((p) => ({ ...p, [name]: e.target.value }))}
                  className="h-8 bg-slate-800 border-slate-700 text-xs" />
              </div>
            ))}
            <div className="space-y-1 w-28">
              <Label className="text-[11px] text-slate-400">Prediction (years)</Label>
              <Input value={history.predictionYears ?? '3'}
                onChange={(e) => set('history', { ...history, predictionYears: e.target.value })}
                className="h-8 bg-slate-800 border-slate-700 text-xs" />
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!selectedId || busy}
              onClick={importHistory} data-testid="history-import">
              {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
              Import cumulatives
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            Field cumulatives become interval rates (WCONHIST) split across the model's producers;
            injection cumulatives drive the injectors (WCONINJH). The deck start date becomes the
            first observation date, and the prediction tail runs each well on its declared controls.
          </p>
          {history.periods && (
            <div className="text-[11px] text-slate-400">
              <div className="text-slate-300 mb-1">
                {history.caseName}: {history.periods.length} periods, {history.startDate} → {history.endDate}
              </div>
              <table className="w-full max-w-md text-left">
                <thead className="text-slate-500">
                  <tr><th className="pr-3 font-normal">from</th><th className="pr-3 font-normal">oil STB/d</th><th className="pr-3 font-normal">water STB/d</th><th className="pr-3 font-normal">gas Mscf/d</th><th className="font-normal">inj STB/d</th></tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.date}>
                      <td className="pr-3">{r.date}</td>
                      <td className="pr-3">{r.orat.toFixed(0)}</td>
                      <td className="pr-3">{r.wrat.toFixed(0)}</td>
                      <td className="pr-3">{r.grat.toFixed(0)}</td>
                      <td>{r.inj.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default HistoryCard;
