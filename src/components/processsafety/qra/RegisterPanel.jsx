// The register (PS3): scenarios (frequency, expected deaths, the effect that
// kills), locations (who stands there, how long, judged against what), and a
// probability of death for every scenario at every location.
import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQraStudio } from '@/contexts/QraStudioContext';
import {
  EFFECTS, EVENT_TREE_OUTCOMES, FREQUENCY_SOURCES, IR_CRITERIA, PD_MODES, PERIODS,
  cellOf, formatSci, locationLabel, scenarioLabel,
} from '@/utils/processSafety/qraStudy';
import {
  Note, Panel, RemoveButton, SelectField,
} from './fields';

const Cellish = ({
  value, onChange, label, testId, error, placeholder,
}) => (
  <Input
    type="text" inputMode="decimal" value={value ?? ''} placeholder={placeholder} aria-label={label}
    aria-invalid={error ? 'true' : undefined} data-testid={testId}
    onChange={(e) => onChange(e.target.value)}
    className={`h-8 bg-slate-950 font-mono text-sm ${error ? 'border-red-500/70' : 'border-slate-700'}`}
  />
);

const MiniSelect = ({
  value, onChange, options, label, testId,
}) => (
  <select
    aria-label={label} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}
    className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-1 text-xs text-slate-100"
  >
    {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
  </select>
);

const FLASH_OPTIONS = [
  { id: 'outside', label: 'Outside the envelope' },
  { id: 'inside', label: 'Inside the envelope' },
];

const DOSE = {
  fire: { unit: 'kW/m2', what: 'Heat flux' },
  explosion: { unit: 'kPa', what: 'Peak overpressure' },
  toxic: { unit: 'P', what: 'Toxic probit probability' },
};

const Scenarios = () => {
  const {
    study, evaluation, updateScenario, addScenario, removeScenario,
  } = useQraStudio();
  const { freqs } = evaluation.register;
  return (
    <Panel title="Scenarios" testId="register-scenarios">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-1 pr-2">Name</th>
              <th className="py-1 pr-2">Frequency from</th>
              <th className="py-1 pr-2">Frequency (per year)</th>
              <th className="py-1 pr-2">Expected deaths N</th>
              <th className="py-1 pr-2">Effect</th>
              <th className="py-1 pr-2">Fire duration (s)</th>
              <th className="py-1" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {study.scenarios.map((s, i) => {
              const f = freqs[i];
              const set = (patch) => updateScenario(s.id, patch);
              return (
                <tr key={s.id} className="border-t border-slate-800 align-top" data-testid={`scenario-${i}`}>
                  <td className="py-1 pr-2">
                    <Input value={s.name} aria-label={`Scenario ${i + 1} name`} onChange={(e) => set({ name: e.target.value })} className="h-8 border-slate-700 bg-slate-950 text-sm" />
                  </td>
                  <td className="py-1 pr-2">
                    <MiniSelect label={`Scenario ${i + 1} frequency from`} value={s.frequencySource} options={FREQUENCY_SOURCES} onChange={(v) => set({ frequencySource: v })} testId={`scenario-${i}-freq-source`} />
                  </td>
                  <td className="py-1 pr-2">
                    {s.frequencySource === 'event-tree' ? (
                      <div className="space-y-1">
                        <MiniSelect
                          label={`Scenario ${i + 1} event tree outcome`} value={s.outcome}
                          options={EVENT_TREE_OUTCOMES.map((o) => ({ id: o, label: o }))}
                          onChange={(v) => set({ outcome: v })} testId={`scenario-${i}-outcome`}
                        />
                        <div className="font-mono text-sky-200" data-testid={`scenario-${i}-freq`} title="Carried over from the event tree">
                          {f.refusal ? 'n/a' : formatSci(f.value, 4)}
                        </div>
                      </div>
                    ) : (
                      <Cellish
                        label={`Scenario ${i + 1} frequency`} value={s.frequencyPerYr}
                        onChange={(v) => set({ frequencyPerYr: v })} testId={`scenario-${i}-freq-input`}
                      />
                    )}
                    {f.refusal ? <div role="alert" className="mt-1 text-[11px] text-red-300">{f.refusal.error}</div> : null}
                  </td>
                  <td className="py-1 pr-2">
                    <Cellish label={`Scenario ${i + 1} expected deaths`} value={s.fatalities} onChange={(v) => set({ fatalities: v })} testId={`scenario-${i}-n-input`} />
                  </td>
                  <td className="py-1 pr-2">
                    <MiniSelect label={`Scenario ${i + 1} effect`} value={s.effect} options={EFFECTS} onChange={(v) => set({ effect: v })} testId={`scenario-${i}-effect`} />
                  </td>
                  <td className="py-1 pr-2">
                    {s.effect === 'fire' ? (
                      <Cellish label={`Scenario ${i + 1} fire duration`} value={s.fireDurationS} onChange={(v) => set({ fireDurationS: v })} testId={`scenario-${i}-duration-input`} />
                    ) : <span className="text-slate-600">n/a</span>}
                  </td>
                  <td className="py-1">
                    <RemoveButton label={`Remove scenario ${scenarioLabel(s, i)}`} onClick={() => removeScenario(s.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={addScenario} className="border-slate-700 bg-slate-900 text-slate-200" data-testid="add-scenario">
        <Plus className="mr-1 h-4 w-4" /> Add scenario
      </Button>
      <Note>
        A scenario is one outcome of one loss of containment in one weather and wind direction, so its frequency is
        f = fS PM Pphi Pi (Purple Book 6.5). N is the expected number of deaths when it happens, and need not be whole.
        A frequency of 0 is allowed and contributes nothing.
      </Note>
    </Panel>
  );
};

const Locations = () => {
  const {
    study, updateLocation, addLocation, removeLocation,
  } = useQraStudio();
  return (
    <Panel title="Locations" testId="register-locations">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-1 pr-2">Name</th>
              <th className="py-1 pr-2">Judged against</th>
              <th className="py-1 pr-2">Period (fraction indoors)</th>
              <th className="py-1 pr-2">Most exposed person here (h/yr)</th>
              <th className="py-1 pr-2">Vulnerability factor (blank is 1)</th>
              <th className="py-1" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {study.locations.map((l, j) => {
              const set = (patch) => updateLocation(l.id, patch);
              return (
                <tr key={l.id} className="border-t border-slate-800" data-testid={`location-${j}`}>
                  <td className="py-1 pr-2">
                    <Input value={l.name} aria-label={`Location ${j + 1} name`} onChange={(e) => set({ name: e.target.value })} className="h-8 border-slate-700 bg-slate-950 text-sm" />
                  </td>
                  <td className="py-1 pr-2">
                    <MiniSelect label={`Location ${j + 1} criterion`} value={l.criterion} options={IR_CRITERIA} onChange={(v) => set({ criterion: v })} testId={`location-${j}-criterion`} />
                  </td>
                  <td className="py-1 pr-2">
                    <MiniSelect label={`Location ${j + 1} period`} value={l.period} options={PERIODS} onChange={(v) => set({ period: v })} />
                  </td>
                  <td className="py-1 pr-2">
                    <Cellish label={`Location ${j + 1} hours per year`} value={l.occupancyHoursPerYr} onChange={(v) => set({ occupancyHoursPerYr: v })} testId={`location-${j}-hours-input`} />
                  </td>
                  <td className="py-1 pr-2">
                    <Cellish label={`Location ${j + 1} vulnerability factor`} value={l.vulnerabilityFactor} onChange={(v) => set({ vulnerabilityFactor: v })} placeholder="1" />
                  </td>
                  <td className="py-1">
                    <RemoveButton label={`Remove location ${locationLabel(l, j)}`} onClick={() => removeLocation(l.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={addLocation} className="border-slate-700 bg-slate-900 text-slate-200" data-testid="add-location">
        <Plus className="mr-1 h-4 w-4" /> Add location
      </Button>
      <Note>
        The hours are those of the one person whose individual risk per annum (IRPA) is judged: 0 where they never go. They
        may total at most 8,760 across the locations. The period sets the fraction indoors of Purple Book Table 5.3 that
        the Purple Book rules need.
      </Note>
    </Panel>
  );
};

const CellEditor = ({ scenario, location, i, j }) => {
  const { study, evaluation, updateCell } = useQraStudio();
  const cell = cellOf(study, scenario.id, location.id);
  const result = evaluation.register.cells[scenario.id]?.[location.id];
  const set = (patch) => updateCell(scenario.id, location.id, patch);
  const tid = `cell-${i}-${j}`;
  const label = `${scenarioLabel(scenario, i)} at ${locationLabel(location, j)}`;
  let input = null;
  if (cell.mode === 'typed') {
    input = <Cellish label={`${label}, probability of death`} value={cell.pd} onChange={(v) => set({ pd: v })} testId={`${tid}-pd-input`} error={result?.error} />;
  } else if (scenario.effect === 'flash-fire') {
    input = (
      <MiniSelect
        label={`${label}, flame envelope`} value={cell.inFlame ? 'inside' : 'outside'} options={FLASH_OPTIONS}
        onChange={(v) => set({ inFlame: v === 'inside' })} testId={`${tid}-envelope`}
      />
    );
  } else {
    const d = DOSE[scenario.effect];
    input = (
      <div className="space-y-1">
        {scenario.effect === 'fire' ? (
          <label className="flex items-center gap-1 text-[11px] text-slate-400">
            <input type="checkbox" checked={Boolean(cell.inFlame)} onChange={(e) => set({ inFlame: e.target.checked })} aria-label={`${label}, in the flame envelope`} />
            in the flame
          </label>
        ) : null}
        {scenario.effect === 'fire' && cell.inFlame ? null : (
          <Cellish
            label={`${label}, ${d.what} (${d.unit})`} value={cell.dose} placeholder={d.unit}
            onChange={(v) => set({ dose: v })} testId={`${tid}-dose-input`} error={result?.error}
          />
        )}
      </div>
    );
  }
  return (
    <td className="min-w-[10rem] border-l border-slate-800 px-2 py-1 align-top" data-testid={tid}>
      <MiniSelect label={`${label}, probability from`} value={cell.mode} options={PD_MODES} onChange={(v) => set({ mode: v })} testId={`${tid}-mode`} />
      <div className="mt-1">{input}</div>
      {result?.error ? (
        <div role="alert" className="mt-1 text-[11px] text-red-300">{result.error}</div>
      ) : (
        <div className="mt-1 font-mono text-[11px] text-slate-300">
          Pd <span data-testid={`${tid}-pd`} className="text-white">{formatSci(result?.probabilityOfDeath, 4)}</span>
          {!result?.typed && result?.exposureTimeUsedS ? <span className="text-slate-500"> ({result.exposureTimeUsedS} s)</span> : null}
        </div>
      )}
    </td>
  );
};

const Matrix = () => {
  const { study } = useQraStudio();
  if (study.scenarios.length === 0 || study.locations.length === 0) {
    return (
      <Panel title="Probability of death" testId="register-matrix">
        <Note>Add at least one scenario and one location.</Note>
      </Panel>
    );
  }
  return (
    <Panel title="Probability of death at each location" testId="register-matrix">
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-1 pr-2">Scenario</th>
              {study.locations.map((l, j) => <th key={l.id} className="border-l border-slate-800 px-2 py-1">{locationLabel(l, j)}</th>)}
            </tr>
          </thead>
          <tbody>
            {study.scenarios.map((s, i) => (
              <tr key={s.id} className="border-t border-slate-800">
                <td className="py-1 pr-2 align-top text-slate-300">
                  {scenarioLabel(s, i)}
                  <div className="text-[10px] text-slate-500">{s.effect}</div>
                </td>
                {study.locations.map((l, j) => <CellEditor key={l.id} scenario={s} location={l} i={i} j={j} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>
        Pd is for an unprotected person outdoors at the location all the time (Purple Book 5.1). The Purple Book rules
        (Figures 5.2 to 5.5): a fire kills in the flame or at 35 kW/m2 and above, else by the Purple Book heat probit at
        the fire duration capped at 20 s; a flash fire kills inside the envelope (the LFL contour) and nowhere else; an
        explosion kills above 30 kPa (0.3 barg); a toxic Pd is the probit probability you bring from the Consequence
        Modelling Studio. The Purple Book limits a toxic exposure to 30 minutes (5.2.2 note 3), so use at most 30
        minutes when you compute it there.
      </Note>
    </Panel>
  );
};

const RegisterPanel = () => (
  <div className="space-y-4">
    <Scenarios />
    <Locations />
    <Matrix />
  </div>
);

export default RegisterPanel;
