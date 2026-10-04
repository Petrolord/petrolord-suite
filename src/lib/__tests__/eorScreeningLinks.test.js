// EOR-U2-002: "Send to EOR Screening" from Fluid, Well Test and Material
// Balance opens EOR Screening with the source named by id in the address,
// the parameter the EOR intake panel reads (EorIntakesPanel SOURCES).
import { eorScreeningHref, EOR_SCREENING_ROUTES, EOR_SOURCE_PARAMS } from '@/lib/eorScreeningLinks';
import { PVT_PROJECT_PARAM } from '@/lib/pvtSource';
import { WTA_PROJECT_PARAM } from '@/lib/wellTestSource';
import { MBAL_CASE_PARAM } from '@/components/eor/EorIntakesPanel'; // re-exported from the lib

describe('eorScreeningHref', () => {
  it('names each source by the parameter the EOR intake reads', () => {
    expect(EOR_SOURCE_PARAMS).toEqual({ pvt: PVT_PROJECT_PARAM, wta: WTA_PROJECT_PARAM, mbal: MBAL_CASE_PARAM });
    expect(eorScreeningHref('pvt', 'f-1')).toBe(`/dashboard/apps/reservoir/eor-screening?fluidProject=f-1`);
    expect(eorScreeningHref('wta', 'w 1')).toBe(`/dashboard/apps/reservoir/eor-screening?wellTestProject=w%201`);
    expect(eorScreeningHref('mbal', 'c-9')).toBe(`/dashboard/apps/reservoir/eor-screening?mbalCase=c-9`);
  });
  it('stays inside the /dev harness when sent from it', () => {
    expect(eorScreeningHref('pvt', 'f-1', { inHarness: true })).toBe(`${EOR_SCREENING_ROUTES[1]}?fluidProject=f-1`);
    expect(EOR_SCREENING_ROUTES[1]).toBe('/dev/studio/eor');
  });
  it('sends nothing without a saved record (negative control: EOR reads by id only)', () => {
    expect(eorScreeningHref('pvt', '')).toBeNull();
    expect(eorScreeningHref('wta', null)).toBeNull();
    expect(eorScreeningHref('nope', 'x')).toBeNull();
  });
});
