// Left rail for the RTA tab (WT9): production history import and the
// transient-linear window. RTA runs on daily production data (t in days,
// rate and flowing pressure), unlike the shut-in transient tabs.
import React, { useRef, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel } from '@/utils/welltest/units';
import { importProductionCsv } from '@/utils/welltest/productionImport';
import { SectionLabel, Field } from './primitives';

// WTA-U1-010: the door reads through productionImport.js (headers in any
// order, units at the door, decimal commas, dates, a read-back). Kept under
// its old name for callers; rows come back oilfield.
export function parseProductionCsv(text, { unitSystem = 'oilfield', rateKind = 'oilRate' } = {}) {
  return importProductionCsv(text, { unitSystem, fluid: rateKind === 'gasRate' ? 'gas' : 'oil' }).rows;
}

const RtaPanel = () => {
  const {
    reservoirInputs, rtaRows, setRtaRows,
    rtaWindows, setRtaWindowField,
    addNotification, unitSystem, rtaImport, setRtaImport,
  } = useWellTestStudio();
  const fileRef = useRef(null);
  const isGas = reservoirInputs.fluid === 'gas';
  const rateKind = isGas ? 'gasRate' : 'oilRate';

  const [pending, setPending] = useState(null); // a file waiting for its date order
  const take = (text, fileName, mapping = null) => {
    const out = importProductionCsv(text, { unitSystem, fluid: isGas ? 'gas' : 'oil', mapping });
    if (out.dateQuestion) {
      setPending({ text, fileName });
      addNotification(`The dates in ${fileName} could be day first or month first. Choose the order below; nothing was loaded yet.`, 'info');
      return;
    }
    setPending(null);
    if (out.error || out.rows.length < 3) {
      addNotification(out.error || `Could not read at least 3 (time, rate, pwf) rows from ${fileName}. ${out.read?.text || ''}`, 'error');
      return;
    }
    setRtaRows(out.rows);
    setRtaImport({ fileName, text: out.read.text, at: new Date().toISOString() });
    addNotification(`Loaded ${out.rows.length} production points from ${fileName}.`, 'success');
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => take(String(ev.target.result || ''), file.name);
    reader.onerror = () => addNotification('Could not read the file', 'error');
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Production data</SectionLabel>
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={onFile} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Import CSV
            </Button>
            {rtaRows.length > 0 && (
              <Button size="sm" variant="ghost" className="text-pl-muted" onClick={() => setRtaRows([])} title="Clear production data">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
          <p className="text-[11px] text-pl-muted">
            Time (days or dates), rate and flowing pressure, found by their headers in any order with the unit each header names; a file with no headers is read as time in days, rate in {unitLabel(rateKind, unitSystem)}, flowing pressure in {unitLabel('pressureAbs', unitSystem)}.
            {rtaRows.length ? ` Loaded: ${rtaRows.length} points.` : ' No production data loaded yet.'}
          </p>
          {pending && (
            <div className="space-y-1" data-testid="wts-rta-date-order">
              <p className="text-[11px] text-pl-warning-text">No date in {pending.fileName} has a day above 12, so the order cannot be read from it.</p>
              <Select onValueChange={(v) => take(pending.text, pending.fileName, { dateOrder: v })}>
                <SelectTrigger className="h-8" aria-label="Date order"><SelectValue placeholder="Choose the date order" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dmy">Day first (13/09/2026)</SelectItem>
                  <SelectItem value="mdy">Month first (09/13/2026)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {rtaRows.length > 0 && rtaImport?.text && (
            <p className="text-[11px] text-pl-muted" data-testid="wts-rta-readback">{rtaImport.fileName}: {rtaImport.text}</p>
          )}
          <p className="text-[11px] text-pl-muted">
            Fluid, initial pressure and rock and fluid properties come from the Data tab. {isGas
              ? 'Gas analyses run on pseudo-pressure with material-balance pseudo-time (dynamic material balance).'
              : 'Oil analyses use pressure and material-balance time.'}
          </p>
        </div>
      </section>

      <section>
        <SectionLabel>Transient linear window</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" suffix="days" value={rtaWindows.linMin} onChange={(v) => setRtaWindowField('linMin', v)} placeholder="auto" />
          <Field label="To" suffix="days" value={rtaWindows.linMax} onChange={(v) => setRtaWindowField('linMax', v)} placeholder="auto" />
        </div>
        <p className="text-[11px] text-pl-muted mt-2">
          Set the window over the early half-slope trend on the log-log plot. The sqrt-time regression there yields
          xf sqrt(k) (Wattenbarger linear flow). Leave blank to use the full record.
        </p>
      </section>

      <section>
        <SectionLabel>Reading the plots</SectionLabel>
        <ul className="text-[11px] text-pl-muted space-y-2 list-disc pl-4">
          <li>Log-log rate-normalized drawdown vs material-balance time: half slope early = linear flow; both curves merging on a late unit slope = boundary-dominated flow.</li>
          <li>The flowing material balance line only means something once boundary-dominated flow is established; transient data curves above it.</li>
          <li>Material-balance time is exact for boundary-dominated flow at any rate history, so shut-ins and rate changes collapse onto one trend.</li>
        </ul>
      </section>
    </div>
  );
};

export default RtaPanel;
