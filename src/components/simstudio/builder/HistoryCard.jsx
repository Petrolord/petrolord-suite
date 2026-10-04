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
  const [csvText, setCsvText] = useState('');
  const [csvMode, setCsvMode] = useState('rates');
  const [gasUnit, setGasUnit] = useState('mscf');
  const [dateOrder, setDateOrder] = useState('');
  const [decimal, setDecimal] = useState('');
  const [questions, setQuestions] = useState([]);
  const [readBack, setReadBack] = useState(null);
  const history = form.history || { enabled: false };
  const source = history.source || 'mbal';
  // SIM-U1 (RL3): the allocation fractions are kept with the form (they were
  // component state, lost on a tab switch, and not in the report)
  const fracs = history.fractions || {};
  const setFracs = (fn) => set('history.fractions', fn(fracs));

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
    addNotification(`History imported: ${out.periods.length} periods, ${out.startDate} to ${out.endDate}`, 'success');
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
    const parsed = parseWellRateCsv(csvText, { dateOrder: dateOrder || null, decimal: decimal || null, gasUnit });
    setQuestions(parsed.questions || []);
    setReadBack({ lines: parsed.readBack || [], errors: parsed.errors });
    if (parsed.questions?.length) {
      addNotification('The file does not settle how to read it: answer the question below the box, then import again.', 'info');
      return;
    }
    if (parsed.errors.length) {
      addNotification(`${parsed.errors.length} line(s) could not be read; nothing was imported. The first: ${parsed.errors[0]}`, 'error');
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
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="w-4 h-4 text-pl-muted" /> Production history
        </CardTitle>
        <label className="flex items-center gap-2 text-[11px] text-pl-muted">
          <input type="checkbox" checked={!!history.enabled} data-testid="history-enabled"
            onChange={(e) => set('history', { ...history, enabled: e.target.checked })} />
          Simulate observed history first
        </label>
      </CardHeader>
      {history.enabled && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[220px]">
              <Label className="text-[11px] text-pl-muted">Source</Label>
              <select value={source}
                onChange={(e) => set('history', { ...history, source: e.target.value, periods: null, wellSummary: null })}
                className="w-full h-8 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text"
                data-testid="history-source">
                <option value="mbal">Material Balance case (field cumulatives, allocated)</option>
                <option value="perwell">Per-well rate CSV (no allocation)</option>
              </select>
            </div>
            <div className="space-y-1 w-28">
              <Label className="text-[11px] text-pl-muted">Prediction (years)</Label>
              <Input value={history.predictionYears ?? '3'}
                onChange={(e) => set('history', { ...history, predictionYears: e.target.value })}
                className="h-8 text-xs" />
            </div>
          </div>

          {source === 'mbal' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 min-w-[220px]">
                <Label className="text-[11px] text-pl-muted">MBAL case</Label>
                <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full h-8 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text"
                  data-testid="history-case-select">
                  <option value="">{cases === null ? 'Loading…' : cases.length ? 'Pick a case…' : 'No Material Balance cases found'}</option>
                  {(cases || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {producers.length > 1 && producers.map((name) => (
                <div key={name} className="space-y-1 w-24">
                  <Label className="text-[11px] text-pl-muted">{name} frac</Label>
                  <Input value={fracs[name] ?? (1 / producers.length).toFixed(2)}
                    onChange={(e) => setFracs((p) => ({ ...p, [name]: e.target.value }))}
                    className="h-8 text-xs" />
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
                className="w-full rounded-md border border-pl-border-strong bg-pl-surface p-2 font-mono text-[11px] text-pl-text" />
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 w-52">
                  <Label className="text-[11px] text-pl-muted">Values are</Label>
                  <select value={csvMode} onChange={(e) => setCsvMode(e.target.value)}
                    className="w-full h-8 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text">
                    <option value="rates">Daily rates</option>
                    <option value="volumes">Interval volumes (spread over the period)</option>
                  </select>
                </div>
                <div className="space-y-1 w-32">
                  <Label className="text-[11px] text-pl-muted">Gas unit (a column with none)</Label>
                  <select value={gasUnit} onChange={(e) => setGasUnit(e.target.value)}
                    className="w-full h-8 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text">
                    <option value="mscf">Mscf</option>
                    <option value="scf">scf (÷1000)</option>
                  </select>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!csvText.trim()}
                  onClick={importCsv} data-testid="history-csv-import">
                  <FileSpreadsheet className="w-3 h-3 mr-1" /> Import per-well rates
                </Button>
              </div>
              {questions.map((q, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-[11px] text-pl-warning-text" data-testid="history-question">
                  {q.kind === 'dateOrder' ? (
                    <>
                      <span>Dates such as {q.examples.join(', ')} could be day first or month first.</span>
                      <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value)} data-testid="history-date-order"
                        className="h-7 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text">
                        <option value="">Choose</option>
                        <option value="dmy">Day first (DD/MM/YYYY)</option>
                        <option value="mdy">Month first (MM/DD/YYYY)</option>
                      </select>
                    </>
                  ) : (
                    <>
                      <span>Numbers such as {q.examples.join(', ')} could use a comma or a dot as the decimal mark.</span>
                      <select value={decimal} onChange={(e) => setDecimal(e.target.value)} data-testid="history-decimal"
                        className="h-7 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text">
                        <option value="">Choose</option>
                        <option value=",">Comma decimals (1.234,5)</option>
                        <option value=".">Dot decimals (1,234.5)</option>
                      </select>
                    </>
                  )}
                </div>
              ))}
              {readBack && (readBack.lines.length > 0 || readBack.errors.length > 0) && (
                <div className="rounded-md border border-pl-border bg-pl-sunken px-2 py-1 text-[11px] text-pl-text" data-testid="history-read-back">
                  {readBack.lines.map((l, i) => <div key={`l${i}`}>{l}</div>)}
                  {readBack.errors.slice(0, 5).map((l, i) => <div key={`e${i}`} className="text-pl-danger-text">{l}</div>)}
                  {readBack.errors.length > 5 && <div className="text-pl-danger-text">and {readBack.errors.length - 5} more</div>}
                </div>
              )}
              <p className="text-[11px] text-pl-muted">
                Any separator, comma or dot decimals, ISO, day-first or month-first dates; units in the headers
                (STB/d, bbl/d, m3/d; Mscf/d, scf/d, MMscf/d, m3/d) are read and converted, a column with no unit takes the gas unit above.
                One row per well per date; well names must match the model's wells. Producer rows become
                WCONHIST with that well's own oil/water/gas; injector rows drive WCONINJH from their phase
                column. A well missing on a date keeps its previous rate.
              </p>
            </div>
          )}

          {source === 'mbal' && (
            <p className="text-[11px] text-pl-muted">
              Field cumulatives become interval rates (WCONHIST) split across the model's producers;
              injection cumulatives drive the injectors (WCONINJH). The deck start date becomes the
              first observation date, and the prediction tail runs each well on its declared controls.
            </p>
          )}

          {history.periods && (
            <div className="text-[11px] text-pl-muted">
              <div className="text-pl-text mb-1">
                {history.caseName}: {history.periods.length} periods, {history.startDate} to {history.endDate}
              </div>
              {Array.isArray(history.wellSummary) && history.wellSummary.length > 0 ? (
                <table className="w-full max-w-md text-left" data-testid="history-well-summary">
                  <thead className="text-pl-muted">
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
                  <thead className="text-pl-muted">
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
