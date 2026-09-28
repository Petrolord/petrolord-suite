// Assay library and blend recipe (DS1).
import React, { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useCrudeAssay } from '@/contexts/CrudeAssayContext';

// Senior test T1: the label was not tied to its input (screen readers read
// an unnamed number box), and the spinner covered the value in the narrow
// SARA fields.
const Field = ({ label, value, onChange, unit, step = 'any' }) => {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} className="text-[11px] text-pl-muted">{label}{unit ? ` (${unit})` : ''}</Label>
      <Input
        id={id} type="number" step={step} value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm px-2 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  );
};

const CrudeCard = ({ crude }) => {
  const { setCrude, removeCrude, blend } = useCrudeAssay();
  const fraction = (blend.fractions || []).find((f) => f.id === crude.id);

  return (
    <div className="rounded-lg border border-pl-border bg-pl-raised p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={crude.name}
          onChange={(e) => setCrude(crude.id, { name: e.target.value })}
          className="h-8 text-sm font-medium"
        />
        <Button
          variant="ghost" size="icon" title="Remove this crude"
          onClick={() => removeCrude(crude.id)}
          className="h-8 w-8 text-pl-muted hover:text-pl-danger-text"
        >
          <Trash2 size={15} />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Volume in blend" unit="%" value={crude.volumeFraction} onChange={(v) => setCrude(crude.id, { volumeFraction: v })} />
        <Field label="API gravity" unit="deg" value={crude.api} onChange={(v) => setCrude(crude.id, { api: v })} />
        <Field label="Sulfur" unit="wt%" value={crude.sulfurWtPct} onChange={(v) => setCrude(crude.id, { sulfurWtPct: v })} />
        <Field label="TAN" unit="mg KOH/g" value={crude.tanMgKohG} onChange={(v) => setCrude(crude.id, { tanMgKohG: v })} />
        <Field label="Viscosity" unit="cSt" value={crude.viscosityCSt} onChange={(v) => setCrude(crude.id, { viscosityCSt: v })} />
        <Field label="Nitrogen" unit="wt%" value={crude.nitrogenWtPct} onChange={(v) => setCrude(crude.id, { nitrogenWtPct: v })} />
        <Field label="Nickel" unit="ppm" value={crude.nickelPpm} onChange={(v) => setCrude(crude.id, { nickelPpm: v })} />
        <Field label="Vanadium" unit="ppm" value={crude.vanadiumPpm} onChange={(v) => setCrude(crude.id, { vanadiumPpm: v })} />
      </div>

      <details className="group">
        <summary className="cursor-pointer text-[11px] text-pl-muted hover:text-pl-text">
          SARA analysis (optional, and it changes the stability screen)
        </summary>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {['saturates', 'aromatics', 'resins', 'asphaltenes'].map((k) => (
            <Field
              key={k}
              label={k[0].toUpperCase() + k.slice(1)} unit="wt%"
              value={crude.sara?.[k] ?? ''}
              onChange={(v) => setCrude(crude.id, { sara: { ...crude.sara, [k]: v } })}
            />
          ))}
        </div>
        <p className="text-[11px] text-pl-muted mt-2">
          With SARA on every crude the stability screen uses the colloidal instability index. Without
          it, the screen falls back to gravity contrast, which is a heuristic and says so.
        </p>
      </details>

      <details>
        <summary className="cursor-pointer text-[11px] text-pl-muted hover:text-pl-text">
          TBP distillation curve
        </summary>
        <div className="mt-2 space-y-1">
          {(crude.curve || []).map((point, i) => (
            <div key={point.volumePercent} className="grid grid-cols-2 gap-2">
              <Input
                type="number" value={point.volumePercent}
                onChange={(e) => setCrude(crude.id, {
                  curve: crude.curve.map((p, k) => (k === i ? { ...p, volumePercent: Number(e.target.value) } : p)),
                })}
                className="h-7 text-xs"
              />
              <Input
                type="number" value={point.temperatureF}
                onChange={(e) => setCrude(crude.id, {
                  curve: crude.curve.map((p, k) => (k === i ? { ...p, temperatureF: Number(e.target.value) } : p)),
                })}
                className="h-7 text-xs"
              />
            </div>
          ))}
          <p className="text-[11px] text-pl-muted">Volume percent distilled, and temperature in degrees F.</p>
        </div>
      </details>

      {crude.placeholderCurve && (
        <p className="text-[11px] text-pl-warning-text" data-testid="crude-placeholder-note">
          Starting figures are placeholders, and the distillation curve is a copy of the first
          example crude, so its line sits on top of that one. Enter this crude's assay and TBP
          curve, then give it a volume.
        </p>
      )}

      {fraction && (
        <p className="text-[11px] text-pl-muted">
          {(fraction.volumeFraction * 100).toFixed(1)}% by volume,
          {' '}{(fraction.massFraction * 100).toFixed(1)}% by mass.
        </p>
      )}
    </div>
  );
};

const AssayPanel = () => {
  const { inputs, addCrude } = useCrudeAssay();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-pl-text">Crudes in the blend</h2>
        <Button variant="outline" size="sm" onClick={addCrude} className="h-7">
          <PlusCircle size={14} className="mr-1" /> Add crude
        </Button>
      </div>
      <p className="text-[11px] text-pl-muted">
        Volumes are normalised, so they need not sum to 100. The two crudes loaded here are
        illustrative starting figures, not published assay sheets; replace them with the seller&apos;s
        assay.
      </p>
      {inputs.crudes.map((c) => <CrudeCard key={c.id} crude={c} />)}
    </div>
  );
};

export default AssayPanel;
