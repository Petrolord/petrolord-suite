// Height & Saturation tab, left rail (SC5): fluid gravities, the free
// water level and the saturation window. The profile itself derives from
// the Capillary tab's working J spec and reservoir rock.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database } from 'lucide-react';
import { FWL_ENTRIES, resolveFwl, wellSnapshot } from '@/utils/scalstudio/fwlDatum';
import { datumLine } from '@/lib/wellDatum';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { SectionLabel } from '@/components/waterflooddesign/primitives';
import ScalField from './ScalField';

const FIELDS = [
  { k: 'gammaW', label: 'γw, water specific gravity', kind: 'gravity' },
  { k: 'gammaHc', label: 'γhc, hydrocarbon specific gravity', kind: 'gravity' },
  { k: 'swMin', label: 'Sw axis minimum', kind: 'fraction' },
  { k: 'swMax', label: 'Sw axis maximum', kind: 'fraction' },
];

const HeightPanel = () => {
  const { height, setHeightField, setFwlEntry, jResolved, reservoir, u } = useScalStudio();
  const [wells, setWells] = useState(null);
  const [wellError, setWellError] = useState('');
  const fwl = resolveFwl(height);
  const entry = height.fwlEntry === 'tvd' ? 'tvd' : 'tvdss';
  const loadWells = async () => {
    try { setWells(await (await import('@/lib/wellsRegistry')).listWells()); } catch (e) { setWells([]); setWellError(e.message || 'Could not read the wells registry.'); }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionLabel>Fluids and datum</SectionLabel>
        {FIELDS.map(({ k, label, kind }) => (
          <ScalField key={k} label={label} kind={kind} testId={`height-${k}`} value={height[k]} onChange={(v) => setHeightField(k, v)} />
        ))}
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Free water level entered as</Label>
          <Select value={entry} onValueChange={(v) => setFwlEntry({ fwlEntry: v })}>
            <SelectTrigger className="h-9" aria-label="Free water level entered as" data-testid="fwl-entry"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(FWL_ENTRIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {entry === 'tvdss' ? (
          <ScalField label="Free water level, TVDSS (optional)" kind="length" testId="height-fwl_tvdss" value={height.fwl_tvdss} onChange={(v) => setHeightField('fwl_tvdss', v)} />
        ) : (
          <div className="space-y-2" data-testid="fwl-tvd-entry">
            {wells === null ? (
              <Button size="sm" variant="outline" onClick={loadWells}><Database className="w-4 h-4 mr-1.5" />Choose a registry well</Button>
            ) : wells.length === 0 ? (
              <p className="text-xs text-pl-muted">{wellError || 'The wells registry holds no wells you can see. Add the well in Well Data Manager, or enter the FWL as TVDSS.'}</p>
            ) : (
              <Select value={height.fwlWell?.id || ''} onValueChange={(id) => setFwlEntry({ fwlWell: wellSnapshot(wells.find((w) => w.id === id)) })}>
                <SelectTrigger className="h-9" aria-label="Registry well"><SelectValue placeholder="Choose a well" /></SelectTrigger>
                <SelectContent>{wells.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {height.fwlWell && <p className="text-[11px] text-pl-muted">{height.fwlWell.name}: {datumLine(fwl.datum, 'm')}</p>}
            <ScalField
              label="Free water level, TVD below the depth reference"
              kind="length"
              testId="height-fwl_tvd"
              value={height.fwl_tvd ?? ''}
              onChange={(v) => setFwlEntry({ fwl_tvd: v })}
            />
            {fwl.error ? (
              <p className="text-xs text-pl-warning-text" data-testid="fwl-error">{fwl.error}</p>
            ) : fwl.fwlFt != null && (
              <p className="text-xs text-pl-text" data-testid="fwl-tvdss">
                FWL {Number(u.show('length', fwl.fwlFt)).toFixed(1)} {u.label('length')} TVDSS. {fwl.basis}.
              </p>
            )}
          </div>
        )}
        <p className="text-[11px] text-pl-muted">
          Height above the free water level is h = Pc divided by 0.4335 times the specific gravity difference.
          With a FWL entered, the table and CSV also carry TVDSS = FWL minus h. TVDSS is depth below the vertical
          datum of the field (MSL unless the well says otherwise), positive down.
        </p>
      </section>
      {(!jResolved.jSpec || !reservoir.props) && (
        <p className="text-xs text-pl-warning-text">
          The profile needs a working J-function and reservoir rock from the Capillary tab first.
        </p>
      )}
    </div>
  );
};

export default HeightPanel;
