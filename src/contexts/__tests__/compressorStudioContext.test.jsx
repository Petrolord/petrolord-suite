/**
 * Numeric gates for the Compressor Station Designer state layer (FC3-0).
 *
 * The engine shim is a two-line re-export, so this context is the whole
 * Suite-side composition, and nothing in the Suite asserted a number
 * about it before this file (FC3 finding S4).
 *
 * The compression engine guards about half of its inputs and hands the
 * rest straight to the arithmetic. Every box below is typed into the
 * studio today. One of them, a negative maximum ratio per stage, makes
 * the engine throw a TypeError from inside a useMemo, which takes the
 * whole page down; the rest come back as a wrong number reported
 * confidently, or as a refusal that sends the user to check four inputs
 * that were all correct.
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: jest.fn(), load: jest.fn(), save: jest.fn(), remove: jest.fn(),
  };
  return { createSavedProjectsService: () => service, __service: service };
});
jest.mock('@/lib/customSupabaseClient', () => {
  const builder = {
    select: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return { supabase: { from: jest.fn(() => builder) } };
});

const savedService = jest.requireMock('@/utils/savedProjects').__service;

import {
  CompressorStudioProvider, useCompressor, dutyIssue, MIN_HEAT_RATE_BTU_HP_HR,
} from '@/contexts/CompressorStudioContext';
import { compressionStage, compressorTrain } from '@/utils/facilities/engine/compression';

let api = null;
const Probe = () => {
  api = useCompressor();
  return null;
};

const mount = async () => {
  await act(async () => {
    render(
      <CompressorStudioProvider>
        <Probe />
      </CompressorStudioProvider>,
    );
  });
};

const set = async (section, key, value) => {
  await act(async () => { api.setSection(section, key, value); });
};

beforeEach(async () => {
  jest.clearAllMocks();
  api = null;
  savedService.list.mockResolvedValue([]);
  await mount();
});

describe('the default duty, as numbers', () => {
  it('stages the train and names what governed it', () => {
    expect(api.train.error).toBeUndefined();
    expect(api.train.stages).toHaveLength(3);
    expect(api.train.governedBy).toBe('discharge temperature');
    expect(api.train.overallRatio).toBeCloseTo(10.0271, 4);
    expect(api.train.ratioPerStage).toBeCloseTo(2.15638, 5);
    expect(api.train.totalBrakeHp).toBeCloseTo(3338.5, 0);
    expect(api.train.finalDischargeF).toBeCloseTo(253.1, 0);
    expect(api.acfm).toBeCloseTo(2174.7, 0);
    expect(api.screen.recommendation).toBe('reciprocating');
    expect(api.fuel.thermalEfficiencyPct).toBeCloseTo(31.8054, 4);
    expect(api.firstStage.error).toBeUndefined();
  });

  it('sweeps discharge pressure with power rising and stages stepping', () => {
    expect(api.sweep.error).toBeUndefined();
    expect(api.sweep.rows).toHaveLength(5);
    const hp = api.sweep.rows.map((r) => r.totalBrakeHp);
    hp.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(hp[i]));
    api.sweep.rows.forEach((r) => expect(Number.isFinite(r.totalBrakeHp)).toBe(true));
  });
});

describe('S3: every typed box is checked at the door, by name', () => {
  it('does not take the page down on a negative maximum ratio per stage', async () => {
    // the shipped engine throws a TypeError here, from inside a useMemo
    await set('machine', 'maxRatioPerStage', '-4');
    expect(api.train.error).toMatch(/maximum ratio per stage must be above 1/i);
    expect(api.sweep.error).toMatch(/maximum ratio per stage must be above 1/i);
  });

  it.each([['1'], ['0.5'], ['-4'], ['0']])(
    'refuses a maximum ratio per stage of %s by naming that box',
    async (v) => {
      await set('machine', 'maxRatioPerStage', v);
      expect(api.train.error).toMatch(/maximum ratio per stage must be above 1/i);
      // and not the shipped message, which names four correct inputs
      expect(api.train.error).not.toMatch(/positive rate, suction pressure/i);
    },
  );

  it('accepts a ratio limit just above 1', async () => {
    await set('machine', 'maxRatioPerStage', '1.5');
    expect(api.train.error).toBeUndefined();
    expect(api.train.stages.length).toBeGreaterThan(3);
  });

  it.each([['0'], ['1.5'], ['-0.2']])(
    'refuses a polytropic efficiency of %s by naming the efficiency',
    async (v) => {
      await set('machine', 'polytropicEfficiency', v);
      expect(api.train.error).toMatch(/polytropic efficiency must be above 0 and at most 1/i);
      // the shipped refusal blamed the temperature limit for all of these
      expect(api.train.error).not.toMatch(/intercool harder/i);
    },
  );

  it.each([['1'], ['0.75'], ['0.5']])('accepts a polytropic efficiency of %s', async (v) => {
    await set('machine', 'polytropicEfficiency', v);
    expect(api.train.error).toBeUndefined();
  });

  it.each([['0'], ['2'], ['-0.5']])(
    'refuses a mechanical efficiency of %s instead of an infinite or negative power',
    async (v) => {
      await set('machine', 'mechanicalEfficiency', v);
      expect(api.train.error).toMatch(/mechanical efficiency must be above 0 and at most 1/i);
    },
  );

  it.each([['-600'], ['-459.67'], ['-500']])(
    'refuses a suction temperature of %s F as below absolute zero',
    async (v) => {
      await set('duty', 'tSuctionF', v);
      expect(api.train.error).toMatch(/absolute zero/i);
      expect(api.train.error).not.toMatch(/intercool harder/i);
    },
  );

  it('accepts a cold but real suction temperature', async () => {
    await set('duty', 'tSuctionF', '-40');
    expect(api.train.error).toBeUndefined();
    expect(api.acfm).toBeGreaterThan(0);
  });

  it('refuses a discharge limit and an intercooler outlet below absolute zero', async () => {
    await set('machine', 'maxDischargeF', '-500');
    expect(api.train.error).toMatch(/maximum discharge temperature of -500 F is at or below absolute zero/i);
    await set('machine', 'maxDischargeF', '300');
    await set('machine', 'interstageCoolToF', '-600');
    expect(api.train.error).toMatch(/intercooler outlet of -600 F is at or below absolute zero/i);
  });

  it.each([['0'], ['-5']])('refuses a gas rate of %s by name', async (v) => {
    await set('duty', 'qMMscfd', v);
    expect(api.train.error).toMatch(/gas rate must be above zero/i);
  });

  it('refuses a blank box by naming it rather than answering', async () => {
    await set('duty', 'qMMscfd', '');
    expect(api.train.error).toMatch(/gas rate needs a number/i);
  });

  it('refuses a discharge at or below the suction', async () => {
    await set('duty', 'pDischargePsig', '85');
    expect(api.train.error).toMatch(/discharge pressure must be above the suction pressure/i);
  });

  it('refuses a driver heat rate that would beat the first law', async () => {
    await set('driver', 'heatRateBtuHpHr', '2000');
    expect(api.fuel.error).toMatch(/more than 100 percent efficient/i);
    expect(api.train.error).toBeUndefined();
  });

  it('takes the heat rate at the boundary and refuses just below it', async () => {
    await set('driver', 'heatRateBtuHpHr', String(MIN_HEAT_RATE_BTU_HP_HR));
    expect(api.fuel.error).toBeUndefined();
    expect(api.fuel.thermalEfficiencyPct).toBeCloseTo(100, 6);
    await set('driver', 'heatRateBtuHpHr', '2544');
    expect(api.fuel.error).toMatch(/more than 100 percent efficient/i);
  });

  it('checks the whole input set in one place', () => {
    expect(dutyIssue({
      qMMscfd: 20,
      pSuctionPsia: 99.7,
      pDischargePsia: 999.7,
      tSuctionF: 100,
      gasSg: 0.65,
      k: 1.28,
      polytropicEfficiency: 0.75,
      mechanicalEfficiency: 0.97,
      maxRatioPerStage: 4,
      maxDischargeF: 300,
      interstageCoolToF: 110,
      cpBtuLbF: 0.55,
    })).toBeNull();
  });
});

describe('the discharge limit the user typed', () => {
  // Engines PR #197 repaired the two defects the studio used to paper over
  // with a dischargeLimitCheck of its own: stageCount tested every trial
  // count from tSuctionF while compressorTrain ran every stage after the
  // first from interstageCoolToF, and the hot-stage warning was measured
  // against a hardcoded 300 F. The count is now tested at the inlet each
  // stage will really have, so the answer that moves is the STAGE COUNT
  // rather than a warning printed over a broken one.

  it('keeps every stage under the limit on the default duty', () => {
    expect(api.train.stages.every((s) => s.tDischargeF <= 300)).toBe(true);
    expect(api.train.stages.filter((s) => s.warning)).toHaveLength(0);
  });

  it('adds a stage when the limit is lowered, instead of breaking it', async () => {
    // Before the repair this stayed at 3 stages with stages 2 and 3 both
    // finishing at 253.1 F, 3.1 F above a stated 250 F limit, on a return
    // whose own governedBy read "discharge temperature".
    await set('machine', 'maxDischargeF', '250');
    expect(api.train.stages).toHaveLength(4);
    expect(api.train.governedBy).toBe('discharge temperature');
    expect(api.train.finalDischargeF).toBeCloseTo(214.28, 2);
    expect(api.train.stages.every((s) => s.tDischargeF <= 250)).toBe(true);
    expect(api.train.stages.filter((s) => s.warning)).toHaveLength(0);
  });

  it('chooses the count from the inlet each stage will really have', async () => {
    // An intercooler 80 F above the suction. Before the repair this gave 3
    // stages finishing at 340.7 F against a 250 F limit, 90.7 F over.
    await set('machine', 'interstageCoolToF', '180');
    await set('machine', 'maxDischargeF', '250');
    expect(api.train.stages).toHaveLength(7);
    expect(api.train.finalDischargeF).toBeCloseTo(244.49, 2);
    expect(api.train.stages.every((s) => s.tDischargeF <= 250)).toBe(true);
    expect(api.train.stages.filter((s) => s.warning)).toHaveLength(0);
  });

  it('never lets a stage finish above the typed limit, over a duty sweep', () => {
    // The studio's own dischargeLimitCheck is gone, so this is the gate
    // that keeps its claim: the panel prints the engine's per-stage
    // warning and nothing else, and a train that breaks its own limit
    // would have to show up here first.
    let trains = 0;
    for (const pd of [400, 985, 2000]) {
      for (const ts of [60, 100, 120]) {
        for (const ic of [90, 110, 130]) {
          for (const md of [250, 300, 350]) {
            const t = compressorTrain({
              qMMscfd: 20, pSuctionPsia: 99.7, pDischargePsia: pd + 14.7, tSuctionF: ts,
              gasSg: 0.65, k: 1.28, polytropicEfficiency: 0.75, mechanicalEfficiency: 0.97,
              maxRatioPerStage: 4, maxDischargeF: md, interstageCoolToF: ic, cpBtuLbF: 0.55,
            });
            expect(t.error).toBeUndefined();
            trains += 1;
            expect(t.stages.every((s) => s.tDischargeF <= md)).toBe(true);
            expect(t.stages.filter((s) => s.warning)).toHaveLength(0);
          }
        }
      }
    }
    expect(trains).toBe(81);
  });
});

describe('the hot-stage warning the panel renders', () => {
  // The panel prints train.stages[].warning and nothing beside it. That
  // field used to be measured against a hardcoded 300 F, so a train staged
  // against 200 F broke it in silence while a train run at 400 F was warned
  // at 310 for nothing. These two prove the surviving path is live and
  // measured against the limit in the box.
  const hotStage = (maxDischargeF) => compressionStage({
    qMMscfd: 20, pSuctionPsia: 99.7, tSuctionF: 100, ratio: 3.4,
    gasSg: 0.65, k: 1.28, polytropicEfficiency: 0.75, mechanicalEfficiency: 0.97,
    maxDischargeF,
  });

  it('warns against the limit the user typed', () => {
    const hot = hotStage(250);
    expect(hot.tDischargeF).toBeCloseTo(340.07, 2);
    expect(hot.warning).toMatch(/discharge at 340\.1 F is above the stated limit of 250\.0 F/);
  });

  it('says nothing about the same stage under a limit that allows it', () => {
    const same = hotStage(400);
    expect(same.tDischargeF).toBeCloseTo(340.07, 2);
    expect(same.warning).toBeNull();
  });
});
