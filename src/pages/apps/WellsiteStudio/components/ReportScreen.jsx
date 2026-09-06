// The handover (WS7) and the daily report (WS8) share one screen: pick
// the period, the model is generated from the records, narratives edit
// their records and the report regenerates, the version is recorded,
// signed, and exported to PDF or DOCX. Generated facts cannot be edited
// here (spec sections 30 and 31): correct the source record.
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import ReportRenderer from './ReportRenderer';
import ReportSignoff from './ReportSignoff';
import { buildModel, handoverPeriod, dailyPeriod, reportRowParams, dailyTemplateOf, HANDOVER_TEMPLATE, citedIds } from '../services/reports';
import { periodText } from '../services/reportText';
import { toRigLocal } from '@/lib/wellsite/time';

export default function ReportScreen({ kind, backend, well, data, tourCfg, nowMs, unit, offsetMin, role, userName, reports, signoffs, onNarrativeSave, onStatus, onChanged }) {
  const [which, setWhich] = useState(kind === 'handover' ? 'last' : 'today');
  const [dayOffset, setDayOffset] = useState(0);
  const [showSources, setShowSources] = useState(false);
  const [recorded, setRecorded] = useState(null); // ws_reports row of this generation
  const template = kind === 'handover' ? HANDOVER_TEMPLATE : dailyTemplateOf(well);
  const period = useMemo(() => (kind === 'handover' ? handoverPeriod(nowMs, tourCfg, { current: which === 'current' }) : dailyPeriod(nowMs - dayOffset * 86400000, tourCfg)), [kind, which, dayOffset, nowMs, tourCfg]);
  const model = useMemo(() => {
    try { return buildModel({ kind, period, well, ...data, template, nowMs, offsetMin }); } catch (e) { return { error: e.message }; }
  }, [kind, period, well, data, template, nowMs, offsetMin]);
  const chainReports = useMemo(() => reports.filter((r) => r.kind === kind && r.period_start === model.period?.start).sort((a, b) => (a.version_no || 1) - (b.version_no || 1)), [reports, kind, model]);
  const latest = chainReports[chainReports.length - 1] || null;
  const chainSignoffs = useMemo(() => signoffs.filter((s) => chainReports.some((r) => r.id === s.report_id)).sort((a, b) => Date.parse(a.signed_at) - Date.parse(b.signed_at)), [signoffs, chainReports]);
  useEffect(() => { setRecorded(null); }, [period.startUtc, kind]);

  const record = async () => {
    const params = await reportRowParams(model, { templateId: template.id });
    const row = await backend.saveReport(well.id, params, latest);
    setRecorded(row);
    onStatus?.(`${kind === 'handover' ? 'Handover' : 'Daily report'} version ${row.version_no} recorded, hash ${row.content_hash.slice(0, 23)}.`);
    onChanged?.();
    return row;
  };
  const sign = async (statement) => {
    try {
      let row = recorded && recorded.content_hash === (await reportRowParams(model, { templateId: template.id })).contentHash ? recorded : null;
      if (!row) row = await record();
      await backend.addSignoff(well.id, row, { role, statement });
      onStatus?.(`Signed as ${userName}, ${String(role).replace(/_/g, ' ')}. Platform countersignature pending until synchronised.`);
      onChanged?.();
    } catch (e) { onStatus?.(e.message); }
  };
  const signoffRows = chainSignoffs.map((s) => ({ ...s, user_name: s.user_id === (backend.__userId || 'user-a') ? userName : s.user_id }));
  // the PDF and DOCX writers load on demand: jsPDF is heavy and must stay out of the workstation's mount graph
  const exportPdf = async () => { try { const { exportReportPdf } = await import('../services/wsExport'); await exportReportPdf(model, { unit, offsetMin, signoffs: signoffRows }); onStatus?.('PDF exported.'); } catch (e) { onStatus?.(e.message); } };
  const exportDocx = async () => { try { const { exportReportDocx } = await import('../services/wsExport'); await exportReportDocx(model, { unit, offsetMin, signoffs: signoffRows }); onStatus?.('DOCX exported.'); } catch (e) { onStatus?.(e.message); } };

  if (model.error) return <div className="p-4 text-xs text-amber-400" data-testid="ws-report-error">{model.error}</div>;
  return (
    <div className="p-4 space-y-4" data-testid={`ws-${kind}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-100">{kind === 'handover' ? 'Shift handover' : 'Daily geological report'}</h2>
        {kind === 'handover' ? (
          <div className="flex gap-1 text-[11px]">
            {[['last', 'Tour just ended'], ['current', 'Current tour so far']].map(([k, l]) => <button key={k} type="button" data-testid={`ws-${kind}-period-${k}`} onClick={() => setWhich(k)} className={`px-2 py-0.5 rounded border ${which === k ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}>{l}</button>)}
          </div>
        ) : (
          <div className="flex gap-1 text-[11px] items-center">
            <button type="button" data-testid="ws-daily-prev" onClick={() => setDayOffset((d) => d + 1)} className="px-2 py-0.5 rounded border border-slate-700 text-slate-400">previous day</button>
            <span className="text-slate-300" data-testid="ws-daily-date">{period.dateLabel}</span>
            <button type="button" data-testid="ws-daily-next" disabled={dayOffset === 0} onClick={() => setDayOffset((d) => Math.max(0, d - 1))} className="px-2 py-0.5 rounded border border-slate-700 text-slate-400 disabled:opacity-40">next day</button>
          </div>
        )}
        <span className="text-[11px] text-slate-500" data-testid={`ws-${kind}-period`}>{periodText(model, offsetMin)}</span>
        <label className="text-[11px] text-slate-400 flex items-center gap-1 ml-auto"><input type="checkbox" checked={showSources} onChange={(e) => setShowSources(e.target.checked)} data-testid={`ws-${kind}-sources`} /> show sources</label>
      </div>
      <div className="text-[11px] text-slate-500" data-testid={`ws-${kind}-meta`}>
        Generated {toRigLocal(Date.parse(model.generated_at), offsetMin).hhmm} rig time from {model.counts.records_in_period} record(s) in the period; template {model.template.name} v{model.template.version}; {citedIds(model).length} record(s) cited.
        {latest ? ` Recorded version ${latest.version_no}${chainSignoffs.length ? `, signed ${chainSignoffs.length} time(s)` : ''}.` : ' Not yet recorded.'}
        {' '}Facts here come from the well record; to change one, correct its record and this regenerates.
      </div>
      <ReportRenderer model={model} unit={unit} onNarrativeSave={(key, text) => onNarrativeSave(key, text, model.period.start)} showSources={showSources} />
      <ReportSignoff signoffs={signoffRows} reportsById={Object.fromEntries(chainReports.map((r) => [r.id, r]))} role={role} userName={userName} onSign={sign} offsetMin={offsetMin} reportVersion={latest ? latest.version_no : null} contentHash={latest ? latest.content_hash : null} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => record().catch((e) => onStatus?.(e.message))} data-testid={`ws-${kind}-record`}>Record this version</Button>
        <Button size="sm" variant="outline" onClick={exportPdf} data-testid={`ws-${kind}-pdf`}>PDF</Button>
        <Button size="sm" variant="outline" onClick={exportDocx} data-testid={`ws-${kind}-docx`}>DOCX</Button>
      </div>
    </div>
  );
}
