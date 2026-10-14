/**
 * 2026-10-14: the wta-1 productivity block (read by Nodal Analysis Studio).
 * The context-free builder against hand numbers, then the real studio on the
 * synthetic sample buildup: J = q / (p* - pwf at shut-in), from the values
 * the studio shows.
 */
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { mountStudio } from '@/components/welltest/__tests__/reportTestKit';
import { wtaProductivity, wtaContractOf } from '@/lib/wellTestSource';

describe('wtaProductivity (context free)', () => {
  test('buildup with p*: J = q / (p* - pwf), skin removed from the drawdown', () => {
    // q 500 STB/D, p* 3000, pwf 2500: J = 500 / 500 = 1.0; dps 200 (skin +4):
    // ideal = 500 / (500 - 200) = 1.6667, FE = 300 / 500 = 0.6
    const { productivity: p, reason } = wtaProductivity({
      family: 'buildup', testType: 'buildup', q: 500, pwf: 2500, pStar: 3000, pi: 3100, dpSkin: 200, skin: 4,
    });
    expect(reason).toBeNull();
    expect(p.pr_psia).toBe(3000);
    expect(p.pr_method).toBe('p*');
    expect(p.pi_stbd_psi).toBeCloseTo(1.0, 12);
    expect(p.dp_skin_psi).toBe(200);
    expect(p.ideal_pi_stbd_psi).toBeCloseTo(500 / 300, 12);
    expect(p.flow_efficiency).toBeCloseTo(0.6, 12);
    expect(p.q_stb_d).toBe(500);
    expect(p.pwf_psia).toBe(2500);
  });

  test('buildup without p* falls back to pi; a stimulated well signs dp_skin negative', () => {
    const { productivity: p } = wtaProductivity({ family: 'buildup', q: 800, pwf: 2000, pStar: null, pi: 2400, dpSkin: 100, skin: -2 });
    expect(p.pr_method).toBe('pi');
    expect(p.pi_stbd_psi).toBeCloseTo(800 / 400, 12);
    expect(p.dp_skin_psi).toBe(-100);
    expect(p.ideal_pi_stbd_psi).toBeCloseTo(800 / 500, 12);
    expect(p.flow_efficiency).toBeCloseTo(1.25, 12);
  });

  test('drawdown uses pi and the last flowing reading; withheld skin leaves no ideal J', () => {
    const { productivity: p } = wtaProductivity({ family: 'drawdown', q: 300, pwf: 2700, pStar: 9999, pi: 3000, dpSkin: null, skin: null });
    expect(p.pr_psia).toBe(3000);
    expect(p.pi_stbd_psi).toBeCloseTo(1, 12);
    expect(p.dp_skin_psi).toBeNull();
    expect(p.ideal_pi_stbd_psi).toBeNull();
    expect(p.flow_efficiency).toBeNull();
  });

  test('refused: gas, injection, pr not above pwf, no rate', () => {
    expect(wtaProductivity({ fluid: 'gas', q: 1, pwf: 1, pi: 2 }).reason).toMatch(/gas test/);
    expect(wtaProductivity({ mirror: true, q: 1, pwf: 1, pi: 2 }).reason).toMatch(/injection or falloff/);
    expect(wtaProductivity({ family: 'drawdown', q: 100, pwf: 3000, pi: 3000 }).reason).toMatch(/not above the flowing pressure/);
    expect(wtaProductivity({ family: 'drawdown', q: 0, pwf: 2000, pi: 3000 }).productivity).toBeNull();
  });
});

describe('wta-1 productivity in a real save (sample buildup)', () => {
  let studio;
  beforeAll(async () => {
    studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
  }, 600000);
  afterAll(() => studio?.unmount());

  test('the saved record carries J from the values on screen', () => {
    const b = wtaContractOf(studio.ctx.serializeInputs());
    const { semilogResult, prepared, reservoirSpec, derivedKpis } = studio.ctx;
    const q = reservoirSpec.reservoir.q;
    const p = b.productivity;
    expect(b.productivity_withheld).toBeNull();
    expect(p.q_stb_d).toBe(q);
    expect(p.pwf_psia).toBe(prepared.pwfShutIn);
    expect(p.pr_psia).toBe(semilogResult.pStar);
    expect(p.pr_method).toBe('p*');
    expect(p.pi_stbd_psi).toBeCloseTo(q / (semilogResult.pStar - prepared.pwfShutIn), 12);
    expect(Math.abs(p.dp_skin_psi)).toBeCloseTo(derivedKpis.dpSkin, 9);
    expect(p.ideal_pi_stbd_psi).toBeCloseTo(q / (semilogResult.pStar - prepared.pwfShutIn - p.dp_skin_psi), 12);
    // the block's FE is the studio's flow efficiency (same pr, pwf and dp_skin)
    expect(p.flow_efficiency).toBeCloseTo(derivedKpis.flowEfficiency, 9);
  });
});

describe('the line that gave p* (2026-10-14)', () => {
  test('a buildup read on the rate history names the superposition line', () => {
    const { productivity } = wtaProductivity({ q: 100, pwf: 2017.9, pStar: 2123.5, pi: 2123.45, pStarLine: 'superposition' });
    expect(productivity.pr_line).toBe('superposition');
    expect(productivity.basis).toMatch(/p\* of the superposition straight line/);
    expect(wtaProductivity({ q: 100, pwf: 2017.9, pStar: 2123.5 }).productivity.pr_line).toBe('Horner');
    expect(wtaProductivity({ q: 100, pwf: 2017.9, pi: 2123.45, family: 'drawdown' }).productivity.pr_line).toBeNull();
  });
});
