// History card (S4/S5): the deck's WCONHIST phase from either source —
// Material Balance Studio field cumulatives split by allocation
// fractions (S4), or per-well rate CSVs where every well keeps its own
// metered rates and no allocation happens at all (S5). The observed
// rates come back on the Results tab as dashed overlays (history match).
import React, { useEffect, useMemo, useState } from 'react';
import { History, Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listMbalCases, listMbalProductionRows } from '@/lib/simService';
import { historyFromRbRows, historyPreviewRows } from '@/utils/simHistoryImport';
import { parseWellRateCsv, historyFromWellRows } from '@/utils/simWellHistoryImport';

const HistoryCard = ({ form, set, addNotification }) => {
  const [cases, setCases] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [fracs, setFracs] = useState({});
  const [csvText, setCsvText] = useState('');
  const [csvMode, setCsvMode] = useState('rates');
  const [gasUnit, setGasUnit] = useState('mscf');
  const history = form.history || { enabled: false };
  const source = history.source || 'mbal';

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
    if (!history.enabled || source !== 'mbal' || cases !== null) return;
    listMbalCases()
      .then(setCases)
      .catch((e) => {
        setCases([]);
        addNotification(e.message, 'error');
      });
  }, [history.enabled, source, cases, addNotification]);

  const fracOf = (name, count) => {
    const v = parseFloat(fracs[name]);
    return Number.isFinite(v) ? v : 1 / count;
  };

  const applyImport = (out, caseName, extra = {}) => {
    set('history', {
      ...history,
      source,
      caseName,
      startDate: out.startDate,
      endDate: out.endDate,
      periods: out.periods,
      wellSummary: out.wellSummary || null,
      ...extra,
    });
    out.warnings.forEach((w) => addNotification(w, 'info'));
    addNotification(`History imported: ${out.periods.length} periods, ${out.startDate} → ${out.endDate}`, 'success');
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
      applyImport(out, rbCase.name);
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const importCsv = () => {
    const parsed = parseWellRateCsv(csvText);
    if (parsed.errors.length) {
      parsed.errors.slice(0, 3).forEach((e) => addNotification(e, 'error'));
      return;
    }
    try {
      const out = historyFromWellRows(
        parsed.rows,
        form.wells.map((w) => ({ name: String(w.name || '').trim().toUpperCase(), type: w.type })),
        { mode: csvMode, gasUnit },
      );
      applyImport(out, `Per-well CSV (${out.wellSummary.length} wells)`);
    } catch (e) {
      addNotification(e.message, 'error');
    }
  };

  const preview = history.periods ? historyPreviewRows(history) : [];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" /> Production history
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
              <Label className="text-[11px] text-slate-400">Source</Label>
              <select value={source}
                onChange={(e) => set('history', { ...history, source: e.target.value, periods: null, wellSummary: null })}
                className="w-full h-8 rounded-md bg-slate-800 border border-slate-700 px-2 text-xs"
                data-testid="history-source">
                <option value="mbal">Material Balance case (field cumulatives, allocated)</option>
                <option value="perwell">Per-well rate CSV (no allocation)</option>
              </select>
            </div>
            <div className="space-y-1 w-28">
              <Label className="text-[11px] text-slate-400">Prediction (years)</Label>
              <Input value={history.predictionYears ?? '3'}
                onChange={(e) => set('history', { ...history, predictionYears: e.target.value })}
                className="h-8 bg-slate-800 border-slate-700 text-xs" />
            </div>
          </div>

          {source === 'mbal' && (
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
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!selectedId || busy}
                onClick={importHistory} data-testid="history-import">
                {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                Import cumulatives
              </Button>
            </div>
          )}

          {source === 'perwell' && (
            <div className="space-y-2">
              <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)}
                rows={6} spellCheck={false} data-testid="history-csv"
                placeholder={'date, well, oil, water, gas\n2024-01-01, PROD1, 1500, 100, 900\n2024-01-01, INJ1, , 2400,'}
                className="w-full rounded-md bg-slate-950 border border-slate-700 p-2 font-mono text-[11px] text-slate-200" />
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 w-52">
                  <Label className="text-[11px] text-slate-400">Values are</Label>
                  <select value={csvMode} onChange={(e) => setCsvMode(e.target.value)}
                    className="w-full h-8 rounded-md bg-slate-800 border border-slate-700 px-2 text-xs">
                    <option value="rates">Daily rates</option>
                    <option value="volumes">Interval volumes (spread over the period)</option>
                  </select>
                </div>
                <div className="space-y-1 w-32">
                  <Label className="text-[11px] text-slate-400">Gas unit</Label>
                  <select value={gasUnit} onChange={(e) => setGasUnit(e.target.value)}
                    className="w-full h-8 rounded-md bg-slate-800 border border-slate-700 px-2 text-xs">
                    <option value="mscf">Mscf</option>
                    <option value="scf">scf (÷1000)</option>
                  </select>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!csvText.trim()}
                  onClick={importCsv} data-testid="history-csv-import">
                  <FileSpreadsheet className="w-3 h-3 mr-1" /> Import per-well rates
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                One row per well per date; well names must match the model's wells. Producer rows become
                WCONHIST with that well's own oil/water/gas; injector rows drive WCONINJH from their phase
                column. A well missing on a date keeps its previous rate.
              </p>
            </div>
          )}

          {source === 'mbal' && (
            <p className="text-[11px] text-slate-500">
              Field cumulatives become interval rates (WCONHIST) split across the model's producers;
              injection cumulatives drive the injectors (WCONINJH). The deck start date becomes the
              first observation date, and the prediction tail runs each well on its declared controls.
            </p>
          )}

          {history.periods && (
            <div className="text-[11px] text-slate-400">
              <div className="text-slate-300 mb-1">
                {history.caseName}: {history.periods.length} periods, {history.startDate} → {history.endDate}
              </div>
              {Array.isArray(history.wellSummary) && history.wellSummary.length > 0 ? (
                <table className="w-full max-w-md text-left" data-testid="history-well-summary">
                  <thead className="text-slate-500">
                    <tr><th className="pr-3 font-normal">well</th><th className="pr-3 font-normal">periods</th><th className="pr-3 font-normal">avg oil STB/d</th><th className="pr-3 font-normal">avg water STB/d</th><th className="font-normal">avg gas Mscf/d</th></tr>
                  </thead>
                  <tbody>
                    {history.wellSummary.map((w) => (
                      <tr key={w.name}>
                        <td className="pr-3">{w.name}</td>
                        <td className="pr-3">{w.periods}</td>
                        <td className="pr-3">{w.avgOil.toFixed(0)}</td>
                        <td className="pr-3">{w.avgWater.toFixed(0)}</td>
                        <td>{w.avgGas.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
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
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default HistoryCard;
