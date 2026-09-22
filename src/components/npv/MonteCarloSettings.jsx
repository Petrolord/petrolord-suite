// W3 (D3): Monte Carlo settings and the sorted sample export for the NPV
// Scenario Builder. Shown only while Full precision is on, so the product view
// is unchanged for everyone else. The run itself is the screening engine's
// runMonteCarlo (the page calls it); this form only chooses its settings.
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Play } from 'lucide-react';
import { sortedSampleCsv, downloadText } from '@/lib/fullPrecision';

const pct = (f) => (Number.isFinite(f) ? String(Math.round(f * 1e6) / 1e4) : '');

export const settingsFromForm = (form) => ({
  iterations: Math.trunc(Number(form.iterations)),
  seed: Math.trunc(Number(form.seed)),
  uncertainties: {
    price: Number(form.price) / 100,
    capex: Number(form.capex) / 100,
    reserves: Number(form.reserves) / 100,
  },
});

export const formFromRisk = (risk) => ({
  iterations: String(risk?.iterations ?? 1000),
  seed: String(risk?.seed ?? ''),
  price: pct(risk?.uncertainties?.price ?? 0.2),
  capex: pct(risk?.uncertainties?.capex ?? 0.2),
  reserves: pct(risk?.uncertainties?.reserves ?? 0.2),
});

export const sampleFilename = (risk) => `npv-monte-carlo-sorted-sample-seed-${risk?.seed ?? 'default'}.csv`;

const FIELDS = [
  ['iterations', 'Iterations'],
  ['price', 'Price range (plus or minus, percent)'],
  ['capex', 'Capex range (plus or minus, percent)'],
  ['reserves', 'Reserves range (plus or minus, percent)'],
  ['seed', 'Seed'],
];

const MonteCarloSettings = ({ risk, onRun, running = false }) => {
  const [form, setForm] = useState(() => formFromRisk(risk));
  useEffect(() => { setForm(formFromRisk(risk)); }, [risk]);
  const valid = Number(form.iterations) >= 1 && Number.isFinite(Number(form.seed)) && form.seed !== ''
    && ['price', 'capex', 'reserves'].every((k) => form[k] !== '' && Number(form[k]) >= 0 && Number(form[k]) <= 100);

  const exportSample = () => {
    const csv = sortedSampleCsv(risk?.allValues || [], 'npv_musd', 10);
    downloadText(sampleFilename(risk), csv);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3" data-testid="npv-mc-settings">
      <p className="text-xs text-slate-400">
        Monte Carlo settings. Each range draws one factor per iteration, uniform on 1 plus or minus the range.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {FIELDS.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`npv-mc-${key}`} className="text-[11px] text-slate-400">{label}</Label>
            <Input
              id={`npv-mc-${key}`}
              type="number"
              step="any"
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="h-8 bg-slate-800 border-slate-700 text-white"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!valid || running} onClick={() => onRun && onRun(settingsFromForm(form))}>
          <Play className="w-3 h-3 mr-2" /> Run Monte Carlo
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!risk?.allValues?.length}
          onClick={exportSample}
          className="border-slate-700 text-slate-300"
          data-testid="npv-export-sorted-sample"
        >
          <Download className="w-3 h-3 mr-2" /> Export sorted sample
        </Button>
      </div>
      <p className="text-[11px] text-slate-500">
        The export lists every iteration's NPV in million USD, sorted from lowest to highest, with its rank.
      </p>
    </div>
  );
};

export default MonteCarloSettings;
