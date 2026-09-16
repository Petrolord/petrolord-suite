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

// eslint-disable-next-line import/first
import {
  CompressorStudioProvider, useCompressor, dutyIssue, MIN_HEAT_RATE_BTU_HP_HR,
} from '@/contexts/CompressorStudioContext';

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
    expect(api.acfm).toBeCloseTo(2173.9, 0);
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
  it('says nothing when every stage stays under it', () => {
    expect(api.dischargeLimitCheck).toBeNull();
    expect(api.train.stages.every((s) => s.tDischargeF <= 300)).toBe(true);
  });

  it('names the stages that finish above it, which the engine does not', async () => {
    // the app's own default intercooler leaves the gas at 110 F against a
    // 100 F suction, so the later stages run hotter than the stage count
    // was chosen for. The engine warns at a fixed 300 F and stays silent.
    await set('machine', 'maxDischargeF', '250');
    expect(api.train.stages).toHaveLength(3);
    expect(api.train.stages.filter((s) => s.warning)).toHaveLength(0);
    expect(api.dischargeLimitCheck).not.toBeNull();
    expect(api.dischargeLimitCheck.limitF).toBe(250);
    expect(api.dischargeLimitCheck.stages.map((s) => s.stage)).toEqual([2, 3]);
    expect(api.dischargeLimitCheck.note).toMatch(/stage 2 at 253\.1 F/);
    expect(api.dischargeLimitCheck.note).toMatch(/above the 250 F limit/);
  });

  it('catches the hotter approach the findings recorded', async () => {
    await set('machine', 'interstageCoolToF', '180');
    await set('machine', 'maxDischargeF', '250');
    expect(api.dischargeLimitCheck.stages).toHaveLength(2);
    expect(api.train.finalDischargeF).toBeCloseTo(340.7, 0);
  });
});
