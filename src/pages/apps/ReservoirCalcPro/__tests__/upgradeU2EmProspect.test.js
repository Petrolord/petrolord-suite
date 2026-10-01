// ReservoirCalc Pro upgrade U2-004: the Earth Modeling prospect contract
// (src/lib/earthModelProspect.js, EM U2-009) consumed with its provenance
// and flags. Through the shipped contract, engine and report lines.

import { EM_PROSPECT_SCHEMA, prospectZoneToRcpInputs } from '@/lib/earthModelProspect';
import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { provenanceFromPayload, provenanceLines, editedSince } from '../services/emProvenance';
import { reviewerLines } from '../services/reportInfo';
import { convertInputsOnSystemChange } from '../services/unitsCatalog';

const payload = {
  schema: EM_PROSPECT_SCHEMA, id: 'abc123', createdAt: '2026-10-01T08:00:00Z',
  model: { name: 'Keta model', crs: 'EPSG:32631', xyUnit: 'm', frame: { nx: 40, ny: 30, dxM: 50, dyM: 50 } },
  wells: ['KETA-1', 'KETA-3'], report: { field: 'Keta', analyst: '' },
  zones: [{
    name: 'Upper Sand', registryZone: 'US', cells: 400, areaM2: 1e6,
    volumes: { bulk_m3: 3e7, net_m3: 2.4e7, pore_m3: 4.8e6, hcpv_m3: 3.36e6, gas_bulk_m3: null, oil_bulk_m3: null, gas_hcpv_m3: null, oil_hcpv_m3: null, stoiip_m3: 2.8e6, giip_m3: null },
    fluids: { goc_m: null, owc_m: 1550, bo: 1.2, bg_rm3_sm3: null, blocks: null },
    flags: ['The trap spills at the model edge; the volume is a minimum.'],
  }],
};
const base = { ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.2, recovery: 25, recoveryGas: 70 };

const handed = (unitSystem = 'metric') => {
  const { inputs } = prospectZoneToRcpInputs(payload, 0, unitSystem);
  return { ...base, ...inputs, emProspect: provenanceFromPayload(payload, 0, inputs) };
};

describe('U2-004 the Earth Modeling prospect in ReservoirCalc Pro', () => {
  it('the handed inputs reproduce the model zone\'s STOIIP in RCP\'s own engine (metric and field)', () => {
    const m = VolumeCalculationEngine.calculateDeterministic(handed('metric'), 'metric', 'simple');
    expect(m.stooip / 2.8e6).toBeCloseTo(1, 9);
    const f = VolumeCalculationEngine.calculateDeterministic(handed('field'), 'field', 'simple');
    expect((f.stooip * 0.158987294928) / 2.8e6).toBeCloseTo(1, 4);
  });

  it('the model\'s flags and provenance travel with the result and the reviewer block', () => {
    const inputs = handed('metric');
    const r = VolumeCalculationEngine.calculateDeterministic(inputs, 'metric', 'simple');
    expect(r.warnings.join(' ')).toMatch(/Earth Modeling: The trap spills at the model edge; the volume is a minimum/);
    expect(r.warnings.join(' ')).toMatch(/Inputs from Earth Modeling: model Keta model, Upper Sand, sent 2026-10-01 \(handoff abc123\); wells KETA-1, KETA-3/);
    const lines = reviewerLines({ unitSystem: 'metric', inputMethod: 'simple', inputs, results: r });
    expect(lines.join('\n')).toMatch(/Unchanged since the handoff: the volumes reproduce the model zone/);
  });

  it('an edit after the handoff is said (negative control: the unedited case claims the model)', () => {
    const inputs = handed('metric');
    expect(editedSince(inputs.emProspect, inputs)).toEqual([]);
    const edited = { ...inputs, porosity: 0.25 };
    expect(editedSince(edited.emProspect, edited)).toEqual(['porosity']);
    expect(provenanceLines(edited).join(' ')).toMatch(/Edited since the handoff: porosity; these volumes no longer reproduce the model/);
  });

  it('a unit toggle converts the record too, so it is not mistaken for an edit', () => {
    const inputs = handed('metric');
    const field = convertInputsOnSystemChange(inputs, 'metric', 'field');
    expect(editedSince(field.emProspect, field)).toEqual([]);
  });

  it('a case with no handoff prints nothing about Earth Modeling', () => {
    expect(provenanceLines(base)).toEqual([]);
  });
});
