// Data-tab inputs added for the reviewer round (2026-10-02): the well and
// test identification with proposals from the shared wells registry, the
// completion (perforated interval, top of net pay, kv/kh), and where each
// reservoir and fluid input came from. State is oilfield always; the unit
// system converts at the field, as everywhere else in the studio.
import React, { useState } from 'react';
import { Database, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { TEST_OPERATIONS, SOURCED_INPUTS, DEFAULT_KVKH, buildCompletion } from '@/utils/welltest/reportModel';
import { countStated } from '@/lib/inputProvenance';
import { InputSourceControl } from '@/lib/inputProvenance/InputSourceControl';
import { proposeFromRegistry, completionPatchFromProposal, zonePatchFromProposal } from '@/utils/welltest/registryProposal';
import { unitLabel, fromOilfield } from '@/utils/welltest/units';
import { SectionLabel, Field, UnitField, fmt } from './primitives';

const NONE = '__none__';

// Proposals from the shared wells registry. Nothing is applied until the
// user presses Apply; each proposed value can be unticked first.
const RegistryProposal = () => {
  const {
    wellName, setWellName, completion, setCompletion, setIdentification, identification,
    setReservoirField, setInputMetaField, addNotification, unitSystem,
  } = useWellTestStudio();
  const [wells, setWells] = useState(null); // null = not loaded
  const [loading, setLoading] = useState(false);
  const [wellId, setWellId] = useState('');
  const [proposal, setProposal] = useState(null);
  const [zoneId, setZoneId] = useState(NONE);
  const [picked, setPicked] = useState({ name: true, zone: true, props: true, tvd: true });
  const L = unitLabel('length', unitSystem);
  const len = (ft) => fmt.f1(fromOilfield('length', ft, unitSystem));

  const load = async () => {
    setLoading(true);
    try {
      const { listWells } = await import('@/lib/wellsRegistry');
      setWells(await listWells());
    } catch (e) {
      setWells([]);
      addNotification(e.message || 'Could not read the wells registry.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const choose = async (id) => {
    setWellId(id);
    setZoneId(NONE);
    const well = (wells || []).find((w) => w.id === id);
    if (!well) { setProposal(null); return; }
    let zones = [];
    try {
      const { listZones } = await import('@/lib/wellsRegistry');
      zones = await listZones(id);
    } catch (e) {
      addNotification(e.message || 'Could not read the zones of that well.', 'error');
    }
    setProposal(proposeFromRegistry({ well, zones, completion }));
  };

  const zone = proposal?.zones.find((z) => String(z.id) === zoneId) || null;
  const zonePatch = zonePatchFromProposal(zone, proposal?.wellName);
  const tvdPatch = completionPatchFromProposal(proposal);
  const hasTvd = Object.keys(tvdPatch).length > 0;
  const propKeys = Object.keys(zonePatch.reservoir);

  const apply = () => {
    const done = [];
    if (picked.name && proposal.wellName) { setWellName(proposal.wellName); done.push('well name'); }
    setIdentification({
      ...identification,
      ...(picked.zone && zone ? zonePatch.identification : {}),
      registryWellId: proposal.wellId || '',
      registryWellName: proposal.wellName || '',
    });
    if (picked.zone && zone) done.push('zone');
    if (picked.props && zone) {
      for (const k of propKeys) {
        setReservoirField(k, zonePatch.reservoir[k]);
        setInputMetaField(k, 'source', zonePatch.inputMeta[k].source);
        setInputMetaField(k, 'note', zonePatch.inputMeta[k].note);
      }
      if (propKeys.length) done.push(propKeys.map((k) => (k === 'h' ? 'net pay' : k === 'phi' ? 'porosity' : 'Sw')).join(', '));
    }
    if (picked.tvd && hasTvd) { setCompletion({ ...completion, ...tvdPatch }); done.push('perforation TVD'); }
    addNotification(done.length ? `Applied from the wells registry: ${done.join('; ')}.` : 'Nothing was ticked, so nothing changed.', done.length ? 'success' : 'info');
    setProposal(null);
    setWellId('');
  };

  const Tick = ({ id, children, disabled }) => (
    <label className={`flex items-start gap-2 text-[11px] ${disabled ? 'text-pl-muted' : 'text-pl-text'}`}>
      <input
        type="checkbox" className="mt-0.5" disabled={disabled}
        checked={!disabled && !!picked[id]} onChange={(e) => setPicked((p) => ({ ...p, [id]: e.target.checked }))}
        data-testid={`wts-registry-pick-${id}`}
      />
      <span>{children}</span>
    </label>
  );

  return (
    <div className="space-y-2" data-testid="wts-registry">
      {wells === null ? (
        <Button size="sm" variant="outline" className="w-full" onClick={load} disabled={loading}>
          <Database className="w-4 h-4 mr-2" /> {loading ? 'Reading the wells registry' : 'Propose from the wells registry'}
        </Button>
      ) : wells.length === 0 ? (
        <p className="text-[11px] text-pl-muted" data-testid="wts-registry-empty">
          The shared wells registry holds no wells you can see. Add the well in Well Data Manager, or type the details here.
        </p>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Registry well</Label>
          <Select value={wellId} onValueChange={choose}>
            <SelectTrigger className="h-9" aria-label="Registry well"><SelectValue placeholder="Choose a well" /></SelectTrigger>
            <SelectContent>
              {wells.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.uwi ? ` (${w.uwi})` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {proposal && (
        <div className="rounded-md border border-pl-border p-3 space-y-2" data-testid="wts-registry-proposal">
          <p className="text-[11px] text-pl-muted">
            Proposed from <span className="text-pl-text font-medium">{proposal.wellName}</span>. Nothing changes until you apply.
          </p>
          <Tick id="name" disabled={!proposal.wellName || proposal.wellName === wellName}>
            Well name: {proposal.wellName || 'none in the registry'}{proposal.wellName === wellName ? ' (already set)' : ''}
          </Tick>
          {proposal.zones.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">Zone tested</Label>
              <Select value={zoneId} onValueChange={setZoneId}>
                <SelectTrigger className="h-8" aria-label="Zone tested"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None chosen</SelectItem>
                  {proposal.zones.map((z) => (
                    <SelectItem key={z.id} value={String(z.id)}>{z.name} ({len(z.topMdFt)} to {len(z.baseMdFt)} {L} MD)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Tick id="zone" disabled={!zone}>Zone or sand: {zone ? zone.name : 'choose a zone above'}</Tick>
          <Tick id="props" disabled={!propKeys.length}>
            {propKeys.length
              ? `From the published zone summary: ${[
                zonePatch.reservoir.h ? `net pay ${len(parseFloat(zonePatch.reservoir.h))} ${L} (${zone.netBasis})` : null,
                zonePatch.reservoir.phi ? `porosity ${zonePatch.reservoir.phi}` : null,
                zonePatch.reservoir.sw ? `Sw ${zonePatch.reservoir.sw}` : null,
              ].filter(Boolean).join(', ')}`
              : 'Net pay, porosity and Sw: no published zone summary to take them from'}
          </Tick>
          <Tick id="tvd" disabled={!hasTvd}>
            {hasTvd
              ? `Perforations in TVD: ${len(proposal.tvd.perfTopTvd)} to ${len(proposal.tvd.perfBaseTvd)} ${L}. ${proposal.tvdSource}.${proposal.tvdNote ? ` Note: ${proposal.tvdNote}.` : ''}`
              : 'Perforations in TVD: enter the perforated interval in MD first, then propose again'}
          </Tick>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={apply} data-testid="wts-registry-apply">Apply ticked values</Button>
            <Button size="sm" variant="ghost" onClick={() => { setProposal(null); setWellId(''); }}>Dismiss</Button>
          </div>
        </div>
      )}
    </div>
  );
};

// Identification beside the well name: licence, zone, dates and how the
// test was run (reviewer item 4).
export const IdentificationFields = () => {
  const { identification, setIdentificationField } = useWellTestStudio();
  return (
    <div className="space-y-3" data-testid="wts-identification">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Licence or block" value={identification.licence} onChange={(v) => setIdentificationField('licence', v)} placeholder="Optional" />
        <Field label="Zone or sand" value={identification.zone} onChange={(v) => setIdentificationField('zone', v)} placeholder="Optional" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted" htmlFor="wts-test-date-start">Test start date</Label>
          <Input id="wts-test-date-start" type="date" className="h-9" value={identification.testDateStart} onChange={(e) => setIdentificationField('testDateStart', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted" htmlFor="wts-test-date-end">Test end date</Label>
          <Input id="wts-test-date-end" type="date" className="h-9" value={identification.testDateEnd} onChange={(e) => setIdentificationField('testDateEnd', e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-pl-muted">How the test was run</Label>
        <Select value={identification.operation || NONE} onValueChange={(v) => setIdentificationField('operation', v === NONE ? '' : v)}>
          <SelectTrigger className="h-9" aria-label="How the test was run"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(TEST_OPERATIONS).map(([k, label]) => <SelectItem key={k || NONE} value={k || NONE}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <RegistryProposal />
    </div>
  );
};

// Perforated interval, top of net pay and kv/kh (reviewer item 3).
export const CompletionFields = () => {
  const { completion, setCompletionField, reservoirInputs, setReservoirField, skinBreakdown, unitSystem } = useWellTestStudio();
  const comp = buildCompletion(completion);
  const L = unitLabel('length', unitSystem);
  return (
    <section data-testid="wts-completion">
      <SectionLabel>Completion</SectionLabel>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <UnitField kind="length" system={unitSystem} label="Perforations top, MD" value={completion.perfTopMd} onChange={(v) => setCompletionField('perfTopMd', v)} placeholder="Optional" />
          <UnitField kind="length" system={unitSystem} label="Perforations base, MD" value={completion.perfBaseMd} onChange={(v) => setCompletionField('perfBaseMd', v)} placeholder="Optional" />
          <UnitField kind="length" system={unitSystem} label="Perforations top, TVD" value={completion.perfTopTvd} onChange={(v) => setCompletionField('perfTopTvd', v)} placeholder="Optional" />
          <UnitField kind="length" system={unitSystem} label="Perforations base, TVD" value={completion.perfBaseTvd} onChange={(v) => setCompletionField('perfBaseTvd', v)} placeholder="Optional" />
          <UnitField kind="length" system={unitSystem} label="Top of net pay, MD" suffixNote="blank = top of perforations" value={completion.payTopMd} onChange={(v) => setCompletionField('payTopMd', v)} />
          <UnitField kind="length" system={unitSystem} label="Top of net pay, TVD" suffixNote="blank = top of perforations" value={completion.payTopTvd} onChange={(v) => setCompletionField('payTopTvd', v)} />
        </div>
        <Field label="kv/kh" suffix={`ratio, blank = ${DEFAULT_KVKH} assumed`} value={reservoirInputs.kvkh ?? ''} onChange={(v) => setReservoirField('kvkh', v)} />
        <p className="text-[11px] text-pl-muted" data-testid="wts-completion-readout">
          {comp.status === 'ok'
            ? `Perforated length ${fmt.f1(fromOilfield('length', comp.hp, unitSystem))} ${L} (${comp.basis}) against net pay ${fmt.f1(fromOilfield('length', parseFloat(reservoirInputs.h), unitSystem))} ${L}. `
            : `${comp.reason} `}
          {skinBreakdown?.status === 'ok' && `Partial-penetration pseudo-skin ${fmt.f2(skinBreakdown.spp)} (${skinBreakdown.method}); the Report tab splits the total skin with it.`}
          {skinBreakdown?.status === 'full' && 'The perforations cover the whole net pay: no partial-penetration skin.'}
          {skinBreakdown?.status === 'refused' && skinBreakdown.message}
        </p>
        <p className="text-[11px] text-pl-muted">
          True vertical depths are used when both ends carry one; otherwise measured depths, which is exact for a vertical hole only.
        </p>
      </div>
    </section>
  );
};

// Where each input came from, and anything a reviewer should know about its
// quality (reviewer item 2). Collapsed until wanted.
export const InputSourcesFields = () => {
  const { inputMeta, setInputMetaField, reservoirInputs } = useWellTestStudio();
  const [open, setOpen] = useState(false);
  const isGas = reservoirInputs.fluid === 'gas';
  const rows = SOURCED_INPUTS.filter((r) => !(isGas && (r.key === 'B' || r.key === 'apiGravity' || r.key === 'gor')));
  const stated = countStated(inputMeta, rows.map((r) => r.key));
  return (
    <section data-testid="wts-input-sources">
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <SectionLabel>Input sources and quality</SectionLabel>
        <span className="flex items-center gap-1 text-[11px] text-pl-muted mb-3">
          {stated} of {rows.length} stated {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-[11px] text-pl-muted">
            For each input say whether it was measured, taken from a correlation (and which), borrowed from an offset well or assumed, and note the sample quality or contamination. The report prints this beside the value.
          </p>
          {rows.map((r) => (
            <InputSourceControl
              key={r.key} testId={`wts-source-${r.key}`} label={r.label} meta={inputMeta?.[r.key]}
              onChange={(field, value) => setInputMetaField(r.key, field, value)}
            />
          ))}
        </div>
      )}
    </section>
  );
};
