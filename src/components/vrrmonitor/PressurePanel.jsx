// Reservoir-pressure surveys + PVT mode (V3, left rail on the Pressure
// tab): manual survey rows, CSV import, and the constant-vs-track FVF
// mode with fluid inputs for the correlation track.
import React, { useRef } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { THEMED_TONE } from '@/components/studio/studioTheme';
import { parsePressureCSV } from '@/utils/vrr/csvImport';

const FLUID_FIELDS = [
  { key: 'api', label: 'Oil API' },
  { key: 'gasSg', label: 'Gas SG' },
  { key: 'gor', label: 'GOR (scf/STB)' },
  { key: 'salinityPpm', label: 'Salinity (ppm)' },
  { key: 'tempF', label: 'Reservoir T (F)' },
];

const PressurePanel = () => {
  const {
    inputs, pvtTrack,
    setPressureSurveys, updateSurvey, addSurvey, removeSurvey,
    setPvtMode, setFluidField, addNotification,
  } = useVrrMonitor();
  const fileRef = useRef(null);
  const modeBtn = (on) => (on ? 'bg-pl-primary/10 border-pl-primary text-pl-primary-text hover:bg-pl-primary/15' : '');

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { surveys, report } = parsePressureCSV(String(ev.target.result));
      if (!surveys.length) {
        addNotification(report.warnings[0] || 'No usable pressure surveys in the file', 'error');
        return;
      }
      setPressureSurveys(surveys);
      const note = report.skipped.length ? ` (${report.skipped.length} rows skipped)` : '';
      addNotification(`Loaded ${surveys.length} pressure surveys${note}`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-pl-muted mb-0">Surveys (date, psia)</Label>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => fileRef.current?.click()} title="Import surveys CSV">
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={addSurvey} title="Add survey">
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </div>
        </div>
        {inputs.pressureSurveys.length === 0 && (
          <p className="text-xs text-pl-muted">
            No surveys yet. Add rows here or import a CSV with date and pressure columns.
          </p>
        )}
        {inputs.pressureSurveys.map((s, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              value={s.date}
              onChange={(e) => updateSurvey(i, 'date', e.target.value)}
              placeholder="YYYY-MM-DD"
              className="h-8 flex-1 min-w-0 font-pl-mono tabular-nums"
              aria-label={`Survey ${i + 1} date`}
            />
            <Input
              value={s.p_psia}
              onChange={(e) => updateSurvey(i, 'p_psia', e.target.value)}
              placeholder="psia"
              className="h-8 w-24 text-right font-pl-mono tabular-nums"
              aria-label={`Survey ${i + 1} pressure (psia)`}
            />
            <button onClick={() => removeSurvey(i)} className="shrink-0 rounded text-pl-muted hover:text-pl-danger-text" title="Remove survey">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <Label className="text-xs text-pl-muted">Fluid properties per period</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline" size="sm"
            className={modeBtn(inputs.pvtMode === 'constant')}
            aria-pressed={inputs.pvtMode === 'constant'}
            onClick={() => setPvtMode('constant')}
          >
            Constant FVF
          </Button>
          <Button
            variant="outline" size="sm"
            className={modeBtn(inputs.pvtMode === 'track')}
            aria-pressed={inputs.pvtMode === 'track'}
            onClick={() => setPvtMode('track')}
          >
            Pressure track
          </Button>
        </div>
        <p className="text-xs text-pl-muted leading-relaxed">
          Pressure track derives Bo, Bw, Bg and Rs per period from black-oil correlations at the
          interpolated period pressure. Periods without a pressure keep the constant FVF set.
        </p>
      </section>

      {inputs.pvtMode === 'track' && (
        <section className="space-y-2">
          {FLUID_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`vrr-fluid-${key}`} className="text-xs text-pl-muted">{label}</Label>
              <Input
                value={inputs.fluid[key]}
                id={`vrr-fluid-${key}`}
                onChange={(e) => setFluidField(key, e.target.value)}
                className="h-8 font-pl-mono tabular-nums"
              />
            </div>
          ))}
          {pvtTrack?.warnings?.length > 0 && (
            <div className={`text-xs border rounded px-2 py-1.5 space-y-0.5 ${THEMED_TONE.warn}`}>
              {pvtTrack.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default PressurePanel;
