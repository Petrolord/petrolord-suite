/**
 * Wave D8 Facilities (episodes 30 to 33): the kit's input sheets through the
 * applications' OWN state.
 *
 * Every Facilities app is typed input only. For each sheet this gate
 *   1. checks every field it names is a label the app's panels actually show,
 *   2. types the rows into the app's real context provider (the same
 *      setSection / setMode / setSegment calls the controls make), so the
 *      unit conversions and the selection rule are the app's and the
 *      numbers come from the vendored engines it calls,
 *   3. checks the provider agrees with the generator's replay of it
 *      (domains/facilities/apps.mjs) and that the episode note quotes
 *      exactly the numbers the provider shows,
 *   4. runs a NEGATIVE CONTROL: one wrong input, typed the same way, must
 *      move the headline past the stated tolerance.
 *
 * It reads the generated kit, so run the generator first:
 *
 *   npx tsx tools/demo-dataset/generate.mjs && npx jest tools/demo-dataset
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, act } from '@testing-library/react';

import {
  APPS, SEPARATOR, LINE, PWT, CORROSION, applyRows, parseCsv, sheetPath, SHEET_HEADERS,
  evaluateSeparator, evaluateLine, evaluatePwt, evaluateCorrosion,
} from '../domains/facilities/apps.mjs';
import { headlines, NEGATIVE } from '../domains/facilities/headlines.mjs';
import { designValues, GAS_COMPOSITION, gasMolarMass, AIR_MW } from '../domains/facilities/basis.mjs';
import { FACILITY_DESIGN } from '../d8spine.mjs';
import { LOCKED } from '../spine.mjs';

import {
  SeparatorStudioProvider, useSeparator, defaultInputs as separatorDefaults,
} from '@/contexts/SeparatorStudioContext';
import {
  LineSizingProvider, useLineSizing, defaultInputs as lineDefaults,
} from '@/contexts/LineSizingContext';
import {
  ProducedWaterProvider, useProducedWater, defaultInputs as pwtDefaults,
} from '@/contexts/ProducedWaterContext';
import {
  CorrosionStudioProvider, useCorrosion, defaultInputs as corrosionDefaults,
} from '@/contexts/CorrosionStudioContext';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

const REPO = path.join(__dirname, '..', '..', '..');
const KIT = path.join(REPO, 'dist-demo', 'ekene-demo-v1');
const read = (rel) => {
  const p = path.join(KIT, rel);
  if (!fs.existsSync(p)) {
    throw new Error(`${rel} is missing: run npx tsx tools/demo-dataset/generate.mjs first.`);
  }
  return fs.readFileSync(p, 'utf8');
};
const sheet = (app) => {
  const [head, ...rows] = parseCsv(read(sheetPath(app)));
  expect(head).toEqual(SHEET_HEADERS);
  return rows;
};
const note = (app) => read(`episodes/episode-${app.n}-${app.app.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`);
const withValue = (rows, key, value) => rows.map((r) => (`${r[0]}|${r[1]}` === key ? [r[0], r[1], value, r[3], r[4]] : r));

const RIG = {
  [SEPARATOR.slug]: { Provider: SeparatorStudioProvider, use: useSeparator, defaults: separatorDefaults, evaluate: evaluateSeparator },
  [LINE.slug]: { Provider: LineSizingProvider, use: useLineSizing, defaults: lineDefaults, evaluate: evaluateLine },
  [PWT.slug]: { Provider: ProducedWaterProvider, use: useProducedWater, defaults: pwtDefaults, evaluate: evaluatePwt },
  [CORROSION.slug]: { Provider: CorrosionStudioProvider, use: useCorrosion, defaults: corrosionDefaults, evaluate: evaluateCorrosion },
};

/** Type the rows into the real provider and return its context value. */
async function typeInto(app, rows) {
  const { Provider, use, defaults } = RIG[app.slug];
  const { edits } = applyRows(app, rows, defaults());
  let ctx = null;
  const Probe = () => { ctx = use(); return null; };
  let view;
  await act(async () => { view = render(React.createElement(Provider, null, React.createElement(Probe))); });
  await act(async () => {
    const segs = edits.filter((e) => e[0] === 'seg').map((e) => e[1]);
    const need = segs.length ? Math.max(...segs) + 1 : 0;
    for (let i = ctx.inputs.profile?.segments?.length ?? need; i < need; i += 1) ctx.addSegment();
  });
  await act(async () => {
    for (const e of edits) {
      if (e[0] === 'mode') ctx.setMode(e[1]);
      else if (e[0] === 'seg') ctx.setSegment(e[1], e[2], e[3]);
      else ctx.setSection(e[1], e[2], e[3]);
    }
  });
  const value = ctx;
  view.unmount();
  return { ctx: value, inputs: value.inputs };
}

/** The provider's numbers in the shape the generator's replay returns. */
function shape(app, ctx) {
  if (app === SEPARATOR) {
    if (ctx.selected.error) return { error: ctx.selected.error };
    const d = ctx.detail;
    return {
      z: ctx.conditions.z, k: ctx.conditions.k,
      diameterFt: ctx.selected.diameterFt, lengthFt: ctx.selected.lengthFt, ldRatio: ctx.selected.ldRatio,
      controlling: d.controlling, lengthGasFt: d.lengthGasFt, liquidRetentionLengthFt: d.liquidRetentionLengthFt,
      waterDropFallS: d.dropChecks.waterDropFallS, oilDropRiseS: d.dropChecks.oilDropRiseS, residenceOilS: d.dropChecks.residenceOilS,
      sweep: ctx.sweep,
    };
  }
  if (app === LINE) return { sizing: ctx.sizing, profile: ctx.profile, wall: ctx.wall };
  if (app === PWT) return { result: ctx.result, devices: ctx.devices.list, fluid: ctx.fluid };
  return ctx.result;
}

const close = (a, b, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe('the Facilities design basis', () => {
  test('the designed gas composition gives the locked gas gravity within 1 percent (and sums to 100)', () => {
    const sum = Object.values(GAS_COMPOSITION).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(1e-9);
    const sg = gasMolarMass() / AIR_MW;
    expect(Math.abs(sg - LOCKED.gas_sg) / LOCKED.gas_sg).toBeLessThan(0.01);
    // negative control: drop the CO2 into methane and the gravity misses
    const lean = { ...GAS_COMPOSITION, CO2: 0, C1: GAS_COMPOSITION.C1 + GAS_COMPOSITION.CO2, C3: 0, C2: GAS_COMPOSITION.C2 + GAS_COMPOSITION.C3 };
    expect(Math.abs(gasMolarMass(lean) / AIR_MW - LOCKED.gas_sg) / LOCKED.gas_sg).toBeGreaterThan(0.01);
  });

  test('the design basis carries the binding d8spine values unchanged, each tagged', () => {
    const [head, ...rows] = parseCsv(read('13-facilities/ekene-alpha-design-basis.csv'));
    expect(head).toEqual(['group', 'item', 'value', 'unit', 'source', 'note']);
    const get = (group, item) => rows.find((r) => r[0] === group && r[1] === item);
    expect(get('rates', 'oil')[2]).toBe(String(FACILITY_DESIGN.oil_bopd));
    expect(get('rates', 'produced water')[2]).toBe(String(FACILITY_DESIGN.water_bwpd));
    expect(get('rates', 'gas')[2]).toBe(String(FACILITY_DESIGN.gas_mmscfd));
    expect(get('rates', 'water injection')[2]).toBe(String(FACILITY_DESIGN.water_injection_bwpd));
    expect(get('separator', 'operating pressure')[2]).toBe(String(FACILITY_DESIGN.separator_pressure_psig));
    expect(get('separator', 'operating temperature')[2]).toBe(String(FACILITY_DESIGN.separator_temperature_f));
    expect(get('export line', 'length')[2]).toBe(String(FACILITY_DESIGN.export_line_length_km));
    for (const r of rows) expect(['spine', 'd8spine', 'designed']).toContain(r[4]);
    expect(rows.filter((r) => r[0] === 'stream table').length).toBeGreaterThanOrEqual(7);
  });
});

describe.each(APPS.map((a) => [a.n, a.app, a]))('Episode %i: %s', (n, name, app) => {
  test('every sheet field is a label the app shows, and every dropdown value is one of its options', () => {
    const src = app.components.map((f) => fs.readFileSync(path.join(REPO, f), 'utf8')).join('\n');
    for (const [section, field, value] of sheet(app)) {
      const m = app.MAP[`${section}|${field}`];
      expect(m).toBeDefined();
      if (!(app.generatedLabels || []).includes(field)) expect(src).toContain(field);
      if (m.options) {
        expect(Object.keys(m.options)).toContain(value);
        if (!m.optionsFromEngine) expect([value, src.includes(value) || src.includes(value.replace(/&/g, '&amp;'))]).toEqual([value, true]);
      }
    }
  });

  test('typed into the app, the sheet gives the numbers the episode note quotes', async () => {
    const rows = sheet(app);
    const good = await typeInto(app, rows);
    const bad = await typeInto(app, withValue(rows, NEGATIVE[app.slug].key, NEGATIVE[app.slug].value));
    const g = shape(app, good.ctx);
    const b = shape(app, bad.ctx);
    expect(g.error).toBeUndefined();

    // the generator's replay of the app agrees with the app
    const replay = RIG[app.slug].evaluate(good.inputs);
    if (app === SEPARATOR) {
      for (const k of ['z', 'k', 'diameterFt', 'lengthFt', 'ldRatio', 'lengthGasFt', 'liquidRetentionLengthFt', 'waterDropFallS']) close(g[k], replay[k]);
      expect(g.controlling).toBe('liquid-retention');
    } else if (app === LINE) {
      close(g.sizing.dpTotalPsi, replay.sizing.dpTotalPsi);
      close(g.profile.p2Psia, replay.profile.p2Psia);
      close(g.wall.tRequiredIn, replay.wall.tRequiredIn);
      close(g.wall.maop, replay.wall.maop);
      expect(g.sizing.exceeded).toBe(false);          // RP 14E is nowhere near at 0.8 ft/s
      expect(g.wall.pass).toBe(true);
    } else if (app === PWT) {
      close(g.result.outletOiwPpm, replay.result.outletOiwPpm);
      expect(g.result.complete).toBe(true);
      expect(g.result.meetsSpec).toBe(true);
    } else {
      close(g.rate.rateMmYr, replay.rate.rateMmYr);
      close(g.life.remainingYears, replay.life.remainingYears);
      expect(g.sour.sour).toBe(false);
      expect(g.withheld).toBeNull();
    }

    // the note quotes exactly what the app shows
    const text = note(app);
    for (const [k, v] of Object.entries(headlines(app.slug, g, b))) {
      if (v === '' || v === null) continue;
      expect([k, text.includes(v)]).toEqual([k, true]);
    }

    // negative control, through the app
    expect(() => NEGATIVE[app.slug].check(g, b)).not.toThrow();
  });
});

test('the same water in three applications, and the notes name only kit files', () => {
  const V = designValues({ assertClose: (l, a, e, t) => expect(Math.abs(a - e)).toBeLessThanOrEqual(t) });
  const cell = (app, field) => Number(sheet(app).find((r) => r[1] === field)[2]);
  expect(Math.abs(cell(SEPARATOR, 'Water SG') * 62.4 * 16.0185 - V.water.rhoKgM3)).toBeLessThan(0.5);
  expect(Math.abs(cell(CORROSION, 'Density (lb/ft3)') * 16.0185 - V.water.rhoKgM3)).toBeLessThan(0.1);
  expect(cell(CORROSION, 'CO2 (mol %)')).toBe(GAS_COMPOSITION.CO2);
  expect(cell(PWT, 'Flow (bwpd)')).toBe(FACILITY_DESIGN.water_bwpd);
  for (const app of APPS) {
    const text = note(app);
    expect(text).toContain(sheetPath(app));
    expect(text).not.toMatch(/—/);             // no em dashes in user-facing copy
  }
  expect(read('13-facilities/README.md')).not.toMatch(/—/);
});
