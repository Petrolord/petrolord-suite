// Left rail for the RTA tab (WT9): production history import and the
// transient-linear window. RTA runs on daily production data (t in days,
// rate and flowing pressure), unlike the shut-in transient tabs.
import React, { useRef } from 'react';
import Papa from 'papaparse';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, toOilfield } from '@/utils/welltest/units';
import { SectionLabel, Field } from './primitives';

// Three numeric columns: time (days), rate, flowing pressure. Rates and
// pressures convert from the active display system to oilfield state.
export function parseProductionCsv(text, { unitSystem = 'oilfield', rateKind = 'oilRate' } = {}) {
  const { data } = Papa.parse(text.trim(), { skipEmptyLines: true });
  const rows = [];
  for (const raw of data) {
    if (!Array.isArray(raw) || raw.length < 3) continue;
    const t = parseFloat(raw[0]);
    const q = parseFloat(raw[1]);
    const pwf = parseFloat(raw[2]);
    if (Number.isFinite(t) && Number.isFinite(q) && Number.isFinite(pwf) && t > 0) {
      rows.push({
        t,
        q: toOilfield(rateKind, q, unitSystem),
        pwf: toOilfield('pressure', pwf, unitSystem),
      });
    }
  }
  return rows;
}

const RtaPanel = () => {
  const {
    reservoirInputs, rtaRows, setRtaRows,
    rtaWindows, setRtaWindowField,
    addNotification, unitSystem,
  } = useWellTestStudio();
  const fileRef = useRef(null);
  const isGas = reservoirInputs.fluid === 'gas';
  const rateKind = isGas ? 'gasRate' : 'oilRate';

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseProductionCsv(String(ev.target.result || ''), { unitSystem, rateKind });
      if (rows.length < 3) {
        addNotification(`Could not read at least 3 (time, rate, pwf) rows. Expected three numeric columns: days, ${unitLabel(rateKind, unitSystem)}, ${unitLabel('pressureAbs', unitSystem)}.`, 'error');
        return;
      }
      setRtaRows(rows);
      addNotification(`Loaded ${rows.length} production points from ${file.name}.`, 'success');
    };
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
            <Button size="sm" variant="outline" className="flex-1 border-slate-700" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Import CSV
            </Button>
            {rtaRows.length > 0 && (
              <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => setRtaRows([])} title="Clear production data">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Three numeric columns: time in days, rate in {unitLabel(rateKind, unitSystem)}, flowing pressure in {unitLabel('pressureAbs', unitSystem)}.
            {rtaRows.length ? ` Loaded: ${rtaRows.length} points.` : ' No production data loaded yet.'}
          </p>
          <p className="text-[11px] text-slate-500">
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
        <p className="text-[11px] text-slate-500 mt-2">
          Set the window over the early half-slope trend on the log-log plot. The sqrt-time regression there yields
          xf sqrt(k) (Wattenbarger linear flow). Leave blank to use the full record.
        </p>
      </section>

      <section>
        <SectionLabel>Reading the plots</SectionLabel>
        <ul className="text-[11px] text-slate-500 space-y-2 list-disc pl-4">
          <li>Log-log rate-normalized drawdown vs material-balance time: half slope early = linear flow; both curves merging on a late unit slope = boundary-dominated flow.</li>
          <li>The flowing material balance line only means something once boundary-dominated flow is established; transient data curves above it.</li>
          <li>Material-balance time is exact for boundary-dominated flow at any rate history, so shut-ins and rate changes collapse onto one trend.</li>
        </ul>
      </section>
    </div>
  );
};

export default RtaPanel;
