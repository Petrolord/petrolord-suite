/**
 * Input provenance (Report Kit, Step 0 of the Reservoir round): the source
 * model and its saved form, the report wording, the shared control, and the
 * PVT provenance contract held against the backbones Fluid Systems Studio
 * really builds (black-oil correlations and equation of state).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PROVENANCE_KEY, INPUT_SOURCES, SOURCE_KINDS, isSourceKind, normalizeMeta, isStated, countStated,
  setProvenanceField, serializeProvenance, deserializeProvenance, provenanceFromPayload,
  sourceText, assumedDefaultText, computedText, inputRow, SOURCE_NOT_STATED, NOT_PROVIDED,
  PVT_PROPERTIES, PVT_HANDOFF_STATE_KEY, pvtMethod, pvtPropertyProvenance, describePvtHandoff,
  validatePvtHandoff, pvtIntake, intakeSourceText,
} from '@/lib/inputProvenance';
import { InputSourceControl } from '@/lib/inputProvenance/InputSourceControl';
import { analyzeFluidSystem, sampleFluidStudioData } from '@/utils/fluidStudioCalculations';
import { runEosPvtTable, emptyComposition } from '@/utils/fluidstudio/eosAnalysis';
import {
  pvtIntakeFromBackbone, INPUT_SOURCES as WT_SOURCES, sourceText as wtSourceText, DEFAULT_KVKH_SOURCE,
} from '@/utils/welltest/reportModel';
import { EMPTY_VALUE } from '@/lib/emptyValue';

describe('the source model', () => {
  test('five kinds: entered with no source stated, lab, correlation, offset well, assumed', () => {
    expect(SOURCE_KINDS).toEqual(['', 'lab', 'correlation', 'offset', 'assumed']);
    expect(INPUT_SOURCES.lab).toBe('Measured (lab)');
    expect(isSourceKind('offset')).toBe(true);
    expect(isSourceKind('guess')).toBe(false);
    expect(isSourceKind('toString')).toBe(false);
  });

  test('a missing record is an empty one', () => {
    expect(normalizeMeta(undefined)).toEqual({ source: '', correlation: '', note: '' });
    expect(normalizeMeta([1, 2])).toEqual({ source: '', correlation: '', note: '' });
    expect(isStated(null)).toBe(false);
    expect(isStated({ source: '' , note: '  ' })).toBe(false);
    expect(isStated({ note: 'core plug 12' })).toBe(true);
    expect(countStated({ h: { source: 'lab' }, phi: { note: 'log' }, sw: { source: '' } }, ['h', 'phi', 'sw', 'rw'])).toBe(2);
  });

  test('setting a field returns a new map and leaves the old one alone', () => {
    const a = { h: { source: 'lab' } };
    const b = setProvenanceField(a, 'h', 'note', 'RFT');
    const c = setProvenanceField(b, 'mu', 'source', 'correlation');
    expect(a).toEqual({ h: { source: 'lab' } });
    expect(c).toEqual({ h: { source: 'lab', note: 'RFT' }, mu: { source: 'correlation' } });
    expect(setProvenanceField(null, 'h', 'source', 'lab')).toEqual({ h: { source: 'lab' } });
  });
});

describe('saved form', () => {
  const map = {
    mu: { source: 'lab', note: ' Bottomhole sample 2 ', correlation: 'left over from before' },
    B: { source: 'correlation', correlation: 'Standing' },
    h: { source: '', note: '' },
    phi: { note: 'log average' },
  };

  test('serialise keeps what is stated and nothing else', () => {
    expect(serializeProvenance(map)).toEqual({
      mu: { source: 'lab', note: 'Bottomhole sample 2' },
      B: { source: 'correlation', correlation: 'Standing' },
      phi: { note: 'log average' },
    });
    expect(serializeProvenance(null)).toEqual({});
  });

  test('round trip through project JSON prints the same words', () => {
    const payload = JSON.parse(JSON.stringify({ name: 'P', [PROVENANCE_KEY]: serializeProvenance(map) }));
    const back = provenanceFromPayload(payload);
    for (const key of Object.keys(map)) expect(sourceText(back[key])).toBe(sourceText({ ...map[key], note: (map[key].note || '').trim() }));
    // and a second save is identical to the first
    expect(serializeProvenance(back)).toEqual(payload[PROVENANCE_KEY]);
  });

  test('what an app saved raw comes back as it was; junk reads as no provenance', () => {
    const raw = { h: { source: 'offset' }, mu: { source: 'lab', note: 'x', correlation: '' } };
    expect(deserializeProvenance(raw)).toEqual(raw);
    expect(deserializeProvenance(undefined)).toEqual({});
    expect(deserializeProvenance('lab')).toEqual({});
    expect(deserializeProvenance([{ source: 'lab' }])).toEqual({});
    expect(deserializeProvenance({ h: 'lab', mu: null, B: { source: 7, extra: 'dropped' } })).toEqual({ B: { source: '7' } });
    expect(provenanceFromPayload({})).toEqual({});
    // a kind from a newer version is kept, and worded as not stated
    expect(sourceText(deserializeProvenance({ h: { source: 'simulated' } }).h)).toBe(SOURCE_NOT_STATED);
  });
});

describe('report wording', () => {
  test('each kind, the correlation name, the note, and what the app itself knows', () => {
    expect(sourceText(null)).toBe('Entered, source not stated');
    expect(sourceText({ source: 'lab' })).toBe('Measured (lab)');
    expect(sourceText({ source: 'correlation', correlation: 'Standing' })).toBe('Correlation: Standing');
    expect(sourceText({ source: 'correlation' })).toBe('Correlation (not named)');
    expect(sourceText({ source: 'offset', note: 'Obodo-3, same sand' })).toBe('Offset well. Obodo-3, same sand');
    expect(sourceText({ source: 'assumed' })).toBe('Assumed');
    // auto wins over the selector, the note still travels
    expect(sourceText({ source: 'lab', note: 'checked' }, computedText('ct = cf + So co + Sw cw'))).toBe('Computed: ct = cf + So co + Sw cw. checked');
    expect(assumedDefaultText(0.1)).toBe('Assumed default 0.1 (no value entered)');
  });

  test('the Well Test studio prints through the same functions', () => {
    expect(WT_SOURCES).toBe(INPUT_SOURCES);
    expect(wtSourceText).toBe(sourceText);
    expect(DEFAULT_KVKH_SOURCE).toBe(assumedDefaultText(0.1));
  });

  test('one row of an inputs table', () => {
    expect(inputRow({ key: 'h', label: 'Net pay h', value: '45', unit: 'ft', meta: { source: 'offset' } }))
      .toEqual({ key: 'h', label: 'Net pay h', value: '45', unit: 'ft', source: 'Offset well' });
    expect(inputRow({ label: 'Water saturation Sw', value: '', unit: 'fraction' }))
      .toEqual({ key: 'Water saturation Sw', label: 'Water saturation Sw', value: EMPTY_VALUE, unit: 'fraction', source: NOT_PROVIDED });
    expect(inputRow({ key: 'kvkh', label: 'kv/kh', value: '0.1', auto: assumedDefaultText(0.1) }).source).toBe('Assumed default 0.1 (no value entered)');
  });
});

describe('the shared control', () => {
  test('shows the source, asks for the correlation name only for a correlation, and reports edits by field', () => {
    const onChange = jest.fn();
    const { rerender } = render(<InputSourceControl label="Viscosity mu" meta={{ source: 'lab', note: 'sample 2' }} onChange={onChange} testId="src-mu" />);
    expect(screen.getByTestId('src-mu')).toBeInTheDocument();
    expect(screen.getByLabelText('Viscosity mu source')).toHaveTextContent('Measured (lab)');
    expect(screen.queryByLabelText('Viscosity mu correlation')).toBeNull();
    expect(screen.getByLabelText('Viscosity mu note')).toHaveValue('sample 2');
    fireEvent.change(screen.getByLabelText('Viscosity mu note'), { target: { value: 'sample 3' } });
    expect(onChange).toHaveBeenLastCalledWith('note', 'sample 3');

    rerender(<InputSourceControl label="Viscosity mu" meta={{ source: 'correlation', correlation: '' }} onChange={onChange} />);
    expect(screen.getByLabelText('Viscosity mu source')).toHaveTextContent('Correlation');
    fireEvent.change(screen.getByLabelText('Viscosity mu correlation'), { target: { value: 'Beggs-Robinson' } });
    expect(onChange).toHaveBeenLastCalledWith('correlation', 'Beggs-Robinson');

    // no record yet: not stated
    rerender(<InputSourceControl label="Net pay h" meta={undefined} onChange={onChange} />);
    expect(screen.getByLabelText('Net pay h source')).toHaveTextContent('Not stated');
    expect(screen.getByLabelText('Net pay h note')).toHaveValue('');
  });
});

describe('PVT provenance contract', () => {
  // the app's own sample inputs, as its Load sample button gives them
  const DEFAULT_FLUID_INPUTS = sampleFluidStudioData();
  const blackOil = analyzeFluidSystem({ ...DEFAULT_FLUID_INPUTS, correlations: { pb_rs_bo: 'vasquez_beggs', viscosity: 'beggs_robinson' } }).backbone;
  const eos = runEosPvtTable({
    ...emptyComposition(),
    zPct: { N2: 0, CO2: 2, H2S: 0, C1: 40, C2: 7, C3: 6, iC4: 0, nC4: 5, iC5: 0, nC5: 0, nC6: 6, 'C7+': 34 },
    plus: { mw: 190, sg: 0.84, tbF: null },
    pressure: 1000,
    temp: 200,
  }, [{ pressure: 500, temperature: 90, enabled: true }, { pressure: 100, temperature: 75, enabled: true }]).backbone;

  test('the backbone Fluid Systems Studio builds from correlations meets the contract, every result with its correlation', () => {
    expect(PVT_HANDOFF_STATE_KEY).toBe('fluidStudioData');
    expect(validatePvtHandoff(blackOil)).toEqual({ ok: true, errors: [], warnings: [] });
    const d = describePvtHandoff(blackOil);
    expect(d.method).toEqual({ kind: 'correlation', text: 'Correlation: Vasquez-Beggs (Rs, Bo), Beggs-Robinson (viscosity)' });
    expect(Object.keys(d.properties).sort()).toEqual(Object.keys(PVT_PROPERTIES).sort());
    expect(d.properties.bo_at_pb.value).toBe(blackOil.bo_at_pb);
    expect(d.properties.bo_at_pb.provenance).toEqual({ source: 'correlation', correlation: 'Vasquez-Beggs', note: 'At the bubble point, from Fluid Systems Studio' });
    expect(d.properties.mu_o_at_pb.provenance.correlation).toBe('Beggs-Robinson');
    expect(d.properties.oil_gravity.role).toBe('input');
    expect(sourceText(d.properties.oil_gravity.provenance)).toBe('Entered, source not stated. Input of the Fluid Systems Studio fluid model');
    // negative control: another choice in the fluid app changes the words
    const standing = analyzeFluidSystem({ ...DEFAULT_FLUID_INPUTS, correlations: { pb_rs_bo: 'standing', viscosity: 'beal_cook_spillman' } }).backbone;
    expect(pvtPropertyProvenance(standing, 'bo_at_pb').correlation).toBe('Standing');
    expect(pvtPropertyProvenance(standing, 'mu_o_at_pb').correlation).toBe('Beal-Cook-Spillman');
  });

  test('the equation-of-state backbone meets the contract and is reported as what it is', () => {
    expect(eos.source).toBe('eos');
    expect(validatePvtHandoff(eos)).toEqual({ ok: true, errors: [], warnings: [] });
    expect(pvtMethod(eos)).toEqual({ kind: 'eos', text: 'Equation of state (compositional model)' });
    expect(pvtPropertyProvenance(eos, 'bo_at_pb')).toEqual({ source: '', note: 'Equation of state (compositional model), at the bubble point, from Fluid Systems Studio' });
  });

  test('a handoff that does not say how, a laboratory one, and a per-property record', () => {
    expect(pvtMethod({ bo_at_pb: 1.3 }).kind).toBe('unstated');
    expect(validatePvtHandoff({ bo_at_pb: 1.3 }).warnings[0]).toMatch(/source is missing/);
    expect(validatePvtHandoff({ source: 'black-oil-correlations', bo_at_pb: 1.3, correlations: { viscosity: 'Beggs-Robinson' } }).warnings).toEqual(['bo_at_pb has no named correlation (correlations.pb_rs_bo).']);
    expect(validatePvtHandoff({}).ok).toBe(false);
    expect(validatePvtHandoff(null).ok).toBe(false);
    expect(pvtPropertyProvenance({ source: 'lab', bo_at_pb: 1.3 }, 'bo_at_pb')).toEqual({ source: 'lab', note: 'At the bubble point, from Fluid Systems Studio' });
    const mixed = { ...blackOil, provenance: { mu_o_at_pb: { source: 'lab', note: 'PVT report 2024-11, sample 2' } } };
    expect(pvtPropertyProvenance(mixed, 'mu_o_at_pb')).toEqual({ source: 'lab', note: 'PVT report 2024-11, sample 2' });
    expect(pvtPropertyProvenance(mixed, 'bo_at_pb').source).toBe('correlation');
    expect(pvtPropertyProvenance(mixed, 'nonsense')).toBeNull();
  });

  test('intake into a consuming app: the patch, the saved intake and the Source column words', () => {
    const map = [
      { property: 'bo_at_pb', key: 'Bo', storeKey: 'boInput', label: 'Bo' },
      { property: 'mu_o_at_pb', key: 'muo', label: 'viscosity' },
      { property: 'oil_gravity', key: 'api', label: 'API gravity' },
      { property: 'pb', key: 'pb', label: 'bubble point' },
    ];
    const out = pvtIntake(blackOil, map);
    expect(out.patch).toEqual({ boInput: String(blackOil.bo_at_pb), muo: String(blackOil.mu_o_at_pb), api: String(blackOil.oil_gravity), pb: String(blackOil.pb) });
    expect(out.applied).toEqual(['Bo', 'viscosity', 'API gravity', 'bubble point']);
    expect(out.intake.fields).toEqual(['Bo', 'muo', 'pb']);
    expect(out.intake.inputFields).toEqual(['api']);
    expect(intakeSourceText(out.intake, 'Bo')).toBe('Correlation: Vasquez-Beggs (Rs, Bo), Beggs-Robinson (viscosity), at the bubble point, from Fluid Systems Studio');
    expect(intakeSourceText(out.intake, 'api')).toBe('Input of the Fluid Systems Studio fluid model');
    expect(intakeSourceText(out.intake, 'other')).toBeNull();
    expect(intakeSourceText(null, 'Bo')).toBeNull();
    expect(out.sources.muo).toBe(out.intake.text);
    const mixed = pvtIntake({ ...blackOil, provenance: { mu_o_at_pb: { source: 'lab', note: 'sample 2' } } }, map);
    expect(mixed.sources.muo).toBe('Measured (lab). sample 2, from Fluid Systems Studio');
    expect(pvtIntake({}, map)).toBeNull();
    expect(pvtIntake(null, map)).toBeNull();
  });

  test('the existing Well Test handoff is unchanged', () => {
    const intake = pvtIntakeFromBackbone(blackOil);
    expect(Object.keys(intake)).toEqual(['patch', 'applied', 'intake']);
    expect(intake.patch).toEqual({
      B: String(blackOil.bo_at_pb), mu: String(blackOil.mu_o_at_pb), apiGravity: String(blackOil.oil_gravity),
      gor: String(blackOil.rsb), solutionGasGravity: String(blackOil.gas_gravity), reservoirTempF: String(blackOil.inlet_temperature),
    });
    expect(intake.applied).toEqual(['Bo', 'viscosity', 'API gravity', 'solution GOR', 'gas gravity', 'temperature']);
    expect(intake.intake).toEqual({
      fields: ['B', 'mu'],
      text: 'Correlation: Vasquez-Beggs (Rs, Bo), Beggs-Robinson (viscosity), at the bubble point, from Fluid Systems Studio',
      inputFields: ['apiGravity', 'gor', 'gasGravity', 'temperature'],
      inputText: 'Input of the Fluid Systems Studio fluid model',
      // WTA-U1-019: the values applied are recorded for a version-1 handoff
      // too, so a later edit is reported as an edit
      values: {
        B: String(blackOil.bo_at_pb), mu: String(blackOil.mu_o_at_pb), apiGravity: String(blackOil.oil_gravity),
        gor: String(blackOil.rsb), gasGravity: String(blackOil.gas_gravity), temperature: String(blackOil.inlet_temperature),
      },
    });
    expect(pvtIntakeFromBackbone(eos).intake.text).toBe('Equation of state (compositional model), at the bubble point, from Fluid Systems Studio');
    expect(pvtIntakeFromBackbone({ bo_at_pb: 1.31 }).intake.text).toBe('PVT model, method not stated by the handoff, at the bubble point, from Fluid Systems Studio');
    expect(pvtIntakeFromBackbone({})).toBeNull();
  });
});
