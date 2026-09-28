// Shared controls for the Materials & Spares Planner views (SC3).
//
// Every engine input is one of these visible controls. A blank control is
// passed to the engine as absent and the engine's refusal is shown verbatim
// by <Refusal>.
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NumericTable, NUMERIC_TABLE } from '@/components/ui/numeric-table';
import { cn } from '@/lib/utils';
import { isRefusal } from '@/utils/supplychain/materialsAdapters';

const inputClass = 'h-8 w-full rounded-md border border-pl-border-strong bg-pl-surface px-2 text-sm text-pl-text placeholder:text-pl-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus';

/** A numeric input. The typed text is kept as it is and read by the adapter. */
export const NumField = ({
  label, value, onChange, testId, hint, placeholder = 'required',
}) => {
  const id = `msp-${testId}`;
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

/** A text input, for ids and labels. */
export const TextField = ({
  label, value, onChange, testId, placeholder = 'required',
}) => {
  const id = `msp-${testId}`;
  return (
    <div className="space-y-1">
      {label ? <label htmlFor={id} className="block text-[11px] font-medium text-pl-text">{label}</label> : null}
      <input
        id={id}
        data-testid={testId}
        type="text"
        className={inputClass}
        value={value ?? ''}
        placeholder={placeholder}
        aria-label={label ? undefined : testId}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

/** A choice with no preselected option: blank until the user states one. */
export const SelectField = ({
  label, value, onChange, options, testId, hint,
}) => {
  const id = `msp-${testId}`;
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

/** The stated rounding rule: none, or up, down or nearest to a multiple. */
export const RoundingField = ({
  label, value, onChange, testId,
}) => (
  <div className="grid grid-cols-2 gap-2">
    <SelectField
      label={label}
      testId={`${testId}-rule`}
      value={value.rule}
      onChange={(rule) => onChange({ ...value, rule })}
      options={[
        { value: 'none', label: 'No rounding' },
        { value: 'up', label: 'Up to a multiple' },
        { value: 'down', label: 'Down to a multiple' },
        { value: 'nearest', label: 'Nearest multiple (halves up)' },
      ]}
    />
    {value.rule && value.rule !== 'none' ? (
      <NumField label="Multiple" testId={`${testId}-multiple`} value={value.multiple} onChange={(multiple) => onChange({ ...value, multiple })} />
    ) : <div />}
  </div>
);

/** Pick a register item and copy its figures into the visible controls. */
export const ItemFill = ({
  items, value, onFill, testId, note,
}) => {
  const [pick, setPick] = React.useState(value || '');
  React.useEffect(() => { setPick(value || ''); }, [value]);
  return (
    <div className="space-y-1 rounded-md border border-pl-border bg-pl-sunken/50 p-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`msp-${testId}`} className="block text-[11px] font-medium text-pl-text">Item</label>
          <select id={`msp-${testId}`} data-testid={testId} className={inputClass} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">No item</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.id}{it.name ? ` (${it.name})` : ''}</option>)}
          </select>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!pick}
          onClick={() => onFill(items.find((it) => it.id === pick))}
          data-testid={`${testId}-fill`}
        >
          Copy figures
        </Button>
      </div>
      {note ? <p className="text-[10px] leading-snug text-pl-muted">{note}</p> : null}
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

/** A result's reason and basis, printed as the engine wrote them. */
export const Basis = ({ reason, basis, testId }) => (
  <div className="space-y-1 rounded-md border border-pl-border bg-pl-sunken/50 p-2 text-[11px] text-pl-muted" data-testid={testId}>
    {reason ? <p className="text-pl-text" data-testid={testId ? `${testId}-reason` : undefined}>{reason}</p> : null}
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
  <div className="rounded-md border border-pl-border bg-pl-sunken/50 p-2">
    <p className="text-[10px] uppercase tracking-wide text-pl-muted">{label}</p>
    <p className="font-pl-mono text-sm font-semibold tabular-nums text-pl-text" data-testid={testId}>{value}</p>
  </div>
);

export const EmptyRegister = () => (
  <Note tone="warn" testId="empty-register">The register is empty. Load the Ekene demo or paste your own register on the Register tab.</Note>
);


/** A NumericTable inside a Panel: the panel is the card, so the table drops its own. */
export const Ledger = ({ className, ...props }) => (
  <NumericTable className={cn('border-0 bg-transparent p-0', className)} {...props} />
);

/** A text cell in a ledger row (names, classes, bands, reasons): left aligned, sans, wrapping. */
export const TextCell = ({ muted = false, className, ...props }) => (
  <td className={cn(NUMERIC_TABLE.cell, 'whitespace-normal text-left font-pl-sans', muted ? 'text-pl-muted' : 'text-pl-text', className)} {...props} />
);
