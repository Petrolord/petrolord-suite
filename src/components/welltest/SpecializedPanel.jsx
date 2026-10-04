// Left rail for the Specialized (straight-line) tab: analysis window bounds
// and, for gas wells, the deliverability test points. Empty bounds mean full
// range, except the semilog line, which defaults to the detected radial
// flow (WTA-T1-001).
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel } from '@/utils/welltest/units';
import { SectionLabel, Field, UnitField, UnitInput, fmt } from './primitives';

const SpecializedPanel = () => {
  const {
    windows, setWindowField, configSpec, regimes, reservoirSpec, autoSemilogWindow, semilogWindowSource,
    deliverabilityInputs, setDeliverabilityField, setDeliverabilityRows,
    rateSkinRows, setRateSkinRows, reservoirInputs, derivedKpis,
  } = useWellTestStudio();
  // WTA-U2-003: v arrives oilfield (UnitInput converts the rate)
  const setSkinRow = (i, key, v) => setRateSkinRows(rateSkinRows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  const canAddThis = Number.isFinite(derivedKpis?.skin) && parseFloat(reservoirInputs.q) > 0;
  const { unitSystem } = useWellTestStudio();
  const isBuildup = configSpec.config?.family === 'buildup';
  const isGas = reservoirSpec.reservoir?.fluid === 'gas';
  const radial = regimes.find((r) => r.regime === 'radial');
  const rows = deliverabilityInputs.rows || [];
  const rowKind = (key) => (key === 'q' ? 'gasRate' : 'pressure');
  // v arrives oilfield: the inputs convert (UnitInput)
  const setRow = (i, key, v) => setDeliverabilityRows(rows.map((r, idx) => (idx === i
    ? { ...r, [key]: v }
    : r)));

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>{isBuildup ? 'Horner window' : 'MDH window'}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" suffix="hr" value={windows.semilogMin} onChange={(v) => setWindowField('semilogMin', v)} placeholder="auto" />
          <Field label="To" suffix="hr" value={windows.semilogMax} onChange={(v) => setWindowField('semilogMax', v)} placeholder="auto" />
        </div>
        {semilogWindowSource === 'radial' && (
          <p className="text-[11px] text-pl-muted mt-2" data-testid="wts-semilog-auto">
            Auto: the line is fitted over the detected radial flow, {fmt.sig3(autoSemilogWindow.min)} to {fmt.sig3(autoSemilogWindow.max)} hr
            shut-in time ({fmt.sig3(radial.xStart)} to {fmt.sig3(radial.xEnd)} hr equivalent time). Type a bound to override.
          </p>
        )}
        {semilogWindowSource === 'manual' && radial && (
          <p className="text-[11px] text-pl-muted mt-2">
            Detected radial flow spans {fmt.sig3(radial.xStart)} to {fmt.sig3(radial.xEnd)} hr (equivalent time). Keep the
            window inside it for a clean straight line; clear both bounds to use it.
          </p>
        )}
        {!radial && (
          <p className="text-[11px] text-pl-warning-text mt-2">
            No radial stabilization detected yet{semilogWindowSource === 'full' ? ', so the line is fitted over all points' : ''}.
            A line through storage-dominated data gives a k far from the truth; set the window on the flat derivative.
          </p>
        )}
      </section>

      <section>
        <SectionLabel>sqrt(t) window</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" suffix="hr" value={windows.sqrtMin} onChange={(v) => setWindowField('sqrtMin', v)} placeholder="auto" />
          <Field label="To" suffix="hr" value={windows.sqrtMax} onChange={(v) => setWindowField('sqrtMax', v)} placeholder="auto" />
        </div>
        <p className="text-[11px] text-pl-muted mt-2">
          Linear-flow diagnostic. Set the window on a half-slope derivative; for fracture half-length, match a fracture model on the Match tab.
        </p>
      </section>

      {!isBuildup && !isGas && (
        <section>
          <SectionLabel>PSS window</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" suffix="hr" value={windows.pssMin} onChange={(v) => setWindowField('pssMin', v)} placeholder="auto" />
            <Field label="To" suffix="hr" value={windows.pssMax} onChange={(v) => setWindowField('pssMax', v)} placeholder="auto" />
          </div>
          <p className="text-[11px] text-pl-muted mt-2">
            Cartesian pwf vs t line during pseudo-steady state gives the connected pore volume.
          </p>
        </section>
      )}

      {isGas && (
        <section>
          <SectionLabel>Deliverability test</SectionLabel>
          <div className="space-y-3">
            <UnitField kind="pressureAbs" system={unitSystem} label="Average reservoir pressure pr" suffixNote="blank = pi" value={deliverabilityInputs.pr} onChange={(v) => setDeliverabilityField('pr', v)} />
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">Method</Label>
              <Select value={deliverabilityInputs.method} onValueChange={(v) => setDeliverabilityField('method', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pressure-squared">Pressure squared (pr² − pwf²)</SelectItem>
                  <SelectItem value="pseudo-pressure">Pseudo-pressure Δm(p)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {rows.length === 0 && (
                <p className="text-[11px] text-pl-muted">Flow-after-flow or isochronal points: stabilized rate and flowing pressure.</p>
              )}
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <UnitInput kind={rowKind('q')} system={unitSystem} value={r.q} onChange={(v) => setRow(i, 'q', v)} placeholder={unitLabel('gasRate', unitSystem)} className="h-8" aria-label={`Gas rate, point ${i + 1}`} />
                  <UnitInput kind={rowKind('pwf')} system={unitSystem} value={r.pwf} onChange={(v) => setRow(i, 'pwf', v)} placeholder={`pwf ${unitLabel('pressureAbs', unitSystem)}`} className="h-8" aria-label={`Flowing pressure, point ${i + 1}`} />
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-pl-muted" onClick={() => setDeliverabilityRows(rows.filter((_, idx) => idx !== i))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="text-pl-muted" onClick={() => setDeliverabilityRows([...rows, { q: '', pwf: '' }])}>
                <Plus className="w-4 h-4 mr-1" /> Add test point
              </Button>
            </div>
          </div>
        </section>
      )}

      {isGas && (
        <section data-testid="wts-rate-skin">
          <SectionLabel>Rate-dependent skin</SectionLabel>
          <div className="space-y-2">
            <p className="text-[11px] text-pl-muted">
              The skin of a gas test is apparent: s&apos; = s + D q. Enter the apparent skin of this well at two or more rates (flow periods or tests that each reached radial flow); the line through them gives s and D. A pseudo-pressure deliverability fit gives D from its b as well.
            </p>
            {rateSkinRows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <UnitInput kind="gasRate" system={unitSystem} value={r.q} onChange={(v) => setSkinRow(i, 'q', v)} placeholder={unitLabel('gasRate', unitSystem)} className="h-8" aria-label={`Rate of skin point ${i + 1}`} />
                <Input value={r.skin} onChange={(e) => setSkinRow(i, 'skin', e.target.value)} placeholder="s'" className="h-8" aria-label={`Apparent skin of point ${i + 1}`} />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-pl-muted" onClick={() => setRateSkinRows(rateSkinRows.filter((_, idx) => idx !== i))} aria-label={`Remove skin point ${i + 1}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" className="text-pl-muted" onClick={() => setRateSkinRows([...rateSkinRows, { q: '', skin: '' }])}>
                <Plus className="w-4 h-4 mr-1" /> Add a rate
              </Button>
              <Button size="sm" variant="outline" disabled={!canAddThis} data-testid="wts-rate-skin-add-this"
                onClick={() => setRateSkinRows([...rateSkinRows, { q: String(reservoirInputs.q), skin: derivedKpis.skin.toFixed(3), note: 'this test' }])}>
                Add this test
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default SpecializedPanel;
