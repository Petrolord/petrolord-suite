// Shared controls for the Marine Logistics Planner views (SC4).
//
// Every engine input is one of these visible controls. A blank control is
// passed to the engine as absent and the engine's refusal is shown verbatim
// by <Refusal>.
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useMarineLogistics } from '@/contexts/MarineLogisticsContext';
import { ACTIVITIES, isRefusal } from '@/utils/supplychain/marineAdapters';

export const inputClass = 'h-8 w-full rounded-md border border-pl-border-strong bg-pl-surface px-2 text-sm text-pl-text placeholder:text-pl-muted focus:outline-none focus:ring-2 focus:ring-pl-focus';
const cellClass = 'h-7 w-full min-w-[4.5rem] rounded border border-pl-border-strong bg-pl-surface px-1.5 text-xs text-pl-text placeholder:text-pl-muted focus:outline-none focus:ring-2 focus:ring-pl-focus';

/** A numeric input. The typed text is kept as it is and read by the adapter. */
export const NumField = ({
  label, value, onChange, testId, hint, placeholder = 'required',
}) => {
  const id = `mlp-${testId}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] font-medium text-pl-text">{label}</label>
      <input
        id={id}
        data-testid={testId}
        type="number"
        step="any"
        className={inputClass}
        value={value === undefined || value === null ? '' : value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="text-[10px] leading-snug text-pl-muted">{hint}</p> : null}
    </div>
  );
};

/** A text input, for ids and names. */
export const TextField = ({
  label, value, onChange, testId, placeholder = 'required', hint,
}) => {
  const id = `mlp-${testId}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] font-medium text-pl-text">{label}</label>
      <input
        id={id}
        data-testid={testId}
        type="text"
        className={inputClass}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="text-[10px] leading-snug text-pl-muted">{hint}</p> : null}
    </div>
  );
};

/** A compact table cell input; `numeric` for figures, text otherwise. */
export const Cell = ({
  value, onChange, testId, label, numeric = true, placeholder = 'required',
}) => (
  <input
    data-testid={testId}
    aria-label={label}
    type={numeric ? 'number' : 'text'}
    step={numeric ? 'any' : undefined}
    className={cellClass}
    value={value === undefined || value === null ? '' : value}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
  />
);

/** A choice with no preselected option: blank until the user states one. */
export const SelectField = ({
  label, value, onChange, options, testId, hint,
}) => {
  const id = `mlp-${testId}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] font-medium text-pl-text">{label}</label>
      <select
        id={id}
        data-testid={testId}
        className={inputClass}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose (required)</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint ? <p className="text-[10px] leading-snug text-pl-muted">{hint}</p> : null}
    </div>
  );
};

/** The activities a weather factor stretches; none ticked until stated. */
export const ActivityChecks = ({
  value, onChange, testId, label = 'Weather factor applies to',
}) => (
  <fieldset className="space-y-1">
    <legend className="text-[11px] font-medium text-pl-text">{label}</legend>
    <div className="flex flex-wrap gap-3">
      {ACTIVITIES.map((a) => (
        <label key={a} className="flex items-center gap-1 text-xs text-pl-text">
          <input
            type="checkbox"
            data-testid={`${testId}-${a}`}
            checked={(value || []).includes(a)}
            onChange={(e) => onChange(e.target.checked ? [...(value || []), a] : (value || []).filter((x) => x !== a))}
          />
          {a === 'sailing' ? 'Sailing time' : a === 'port' ? 'Port time' : 'Field time'}
        </label>
      ))}
    </div>
  </fieldset>
);

/** A fixed value or a triangular distribution, the form chosen by the user. */
export const DistField = ({
  title, mode, fixed, tri, onMode, onFixed, onTri, testId, hint,
}) => (
  <div className="space-y-2 rounded-md border border-pl-border p-2">
    <SelectField
      label={title}
      testId={`${testId}-mode`}
      value={mode}
      onChange={onMode}
      hint={hint}
      options={[{ value: 'fixed', label: 'A fixed value' }, { value: 'triangular', label: 'Triangular: minimum, most likely, maximum' }]}
    />
    {mode === 'fixed' ? <NumField label="Value" testId={`${testId}-fixed`} value={fixed} onChange={onFixed} /> : null}
    {mode === 'triangular' ? (
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Minimum" testId={`${testId}-min`} value={tri.min} onChange={(v) => onTri({ ...tri, min: v })} />
        <NumField label="Most likely" testId={`${testId}-mode-value`} value={tri.mode} onChange={(v) => onTri({ ...tri, mode: v })} />
        <NumField label="Maximum" testId={`${testId}-max`} value={tri.max} onChange={(v) => onTri({ ...tri, max: v })} />
      </div>
    ) : null}
  </div>
);

/** The vessel and route a voyage calculation sails, from the cluster. */
export const VesselRouteFields = ({ section, testId }) => {
  const { inputs, setSection } = useMarineLogistics();
  const s = inputs[section];
  const set = (patch) => setSection(section, patch);
  const vessels = inputs.cluster.vessels;
  return (
    <div className="grid grid-cols-2 gap-2">
      <SelectField
        label="Vessel"
        testId={`${testId}-vessel`}
        value={s.vessel}
        onChange={(v) => set({ vessel: v })}
        options={vessels.map((v) => ({ value: v.key, label: v.name ? `${v.name} (${v.key})` : v.key }))}
        hint={vessels.length ? undefined : 'Add a vessel on the Installations tab.'}
      />
      <SelectField
        label="Route"
        testId={`${testId}-mode`}
        value={s.mode}
        onChange={(v) => set({ mode: v })}
        options={[
          { value: 'milk-run', label: 'Milk run: every installation once, in the stated order' },
          { value: 'dedicated', label: 'Dedicated: base to each installation and back' },
        ]}
      />
    </div>
  );
};

export const Panel = ({
  title, children, testId, right,
}) => (
  <section data-testid={testId} className="rounded-lg border border-pl-border bg-pl-surface p-3">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-pl-text">{title}</h3>
      {right}
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

export const Note = ({ children, tone = 'info', testId }) => (
  <p data-testid={testId} className={`flex items-start gap-2 text-[11px] leading-relaxed ${tone === 'warn' ? 'text-pl-warning-text' : 'text-pl-muted'}`}>
    {tone === 'warn' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
    <span>{children}</span>
  </p>
);

/** The engine's refusal, word for word, with the input it names. */
export const Refusal = ({ result, testId }) => (
  <div data-testid={testId} className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-3">
    <p className="flex items-center gap-2 text-sm font-semibold text-pl-warning-text">
      <AlertTriangle className="h-4 w-4" /> The engine refused these inputs
    </p>
    <p className="mt-1 font-mono text-xs text-pl-warning-text" data-testid={testId ? `${testId}-message` : undefined}>{result.error}</p>
    {result.field ? <p className="mt-1 text-[11px] text-pl-warning-text">Input named: {result.field}</p> : null}
  </div>
);

/** A result's reasons and basis, printed as the engine wrote them. */
export const Basis = ({ reasons, basis, testId }) => (
  <div className="space-y-1 rounded-md border border-pl-border bg-pl-sunken p-2 text-[11px] text-pl-muted" data-testid={testId}>
    {(reasons || []).map((r, i) => (
      <p key={i} className="text-pl-text" data-testid={testId ? `${testId}-reason-${i}` : undefined}>{r}</p>
    ))}
    {basis ? Object.entries(basis).map(([k, v]) => (
      <p key={k}><span className="font-semibold text-pl-text">{k}: </span>{v}</p>
    )) : null}
  </div>
);

/** Either the refusal, or the children rendered with the result. */
export const ResultGate = ({ result, testId, children }) => (
  isRefusal(result) ? <Refusal result={result} testId={`${testId}-refusal`} /> : children(result)
);

export const Stat = ({ label, value, testId }) => (
  <div className="rounded-md border border-pl-border bg-pl-sunken p-2">
    <p className="text-[10px] uppercase tracking-wide text-pl-muted">{label}</p>
    <p className="text-sm font-semibold text-pl-text" data-testid={testId}>{value}</p>
  </div>
);
