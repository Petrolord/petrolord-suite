/**
 * AppUpgrade PETRO-U2-009 (PETRO-U1-025) and U2-013 (PETRO-U1-026).
 * U2-009: every curve the Studio published says whether it still matches
 * the interpretation now open (parameters, zone overrides, pipeline), and
 * facies intervals carry the key of the rules that made them.
 * U2-013: a PHIE row published before PT9a (pipeline below 5) holds total
 * porosity; it is flagged wherever it is read (the Studio, Well Data
 * Manager, Rock Physics, Data AI, Earth Modeling via the zone summary) and
 * the well owner gets an explicit Republish that replaces it. Nothing is
 * rewritten on its own.
 *
 * Negative controls (run 2026-09-29): with publishedCurveState ignoring
 * the parameters, the "move a parameter" case stays current and fails; with
 * the Republish path not retiring old rows, the old PHIE survives and the
 * last case fails.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { isPrePt9aPhie, isPrePt9aZone } from '@/lib/petroProvenance';
import { DEFAULT_PARAMS, PIPELINE_VERSION } from '../engine/pipeline';
import { publishedCurveState, publishedSummary, faciesState, faciesKey, changedKeys } from '../services/publishedCurves';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

const studioLog = (mnemonic, prov) => ({ id: mnemonic, mnemonic, provenance: { computed: true, engine: 'petrophysics-studio', pipeline_version: PIPELINE_VERSION, project_id: 'p1', params: { ...DEFAULT_PARAMS }, zone_params: {}, ...prov } });

describe('state of a published curve', () => {
  const ctx = { params: { ...DEFAULT_PARAMS }, zoneParams: {}, projectId: 'p1' };
  test('current, then stale with the reason when a parameter or an override moves', () => {
    expect(publishedCurveState(studioLog('SW', {}), ctx).state).toBe('current');
    const moved = publishedCurveState(studioLog('SW', {}), { ...ctx, params: { ...DEFAULT_PARAMS, rw: 0.04 } });
    expect(moved).toMatchObject({ state: 'stale', reasons: ['parameters changed: rw'] });
    expect(publishedCurveState(studioLog('SW', {}), { ...ctx, zoneParams: { z1: { cutPhi: 0.1 } } }).reasons[0]).toMatch(/zone overrides changed \(1 zone\)/);
    expect(publishedCurveState(studioLog('SW', { pipeline_version: 6 }), ctx).reasons[0]).toBe(`pipeline 6 (now ${PIPELINE_VERSION})`);
  });
  test('another interpretation, other apps\' curves and operations are not judged', () => {
    expect(publishedCurveState(studioLog('SW', { project_id: 'p2', interpretation_name: 'Base' }), ctx)).toMatchObject({ state: 'other', interpretation: 'Base' });
    expect(publishedCurveState({ mnemonic: 'SW', provenance: {} }, ctx)).toBeNull();
    expect(publishedCurveState(studioLog('SW_LOW', { operation: 'scenario' }), ctx)).toBeNull();
    expect(changedKeys({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toEqual([]);
  });
  test('facies intervals: the rules key says current or stale; no key reads unknown', () => {
    const rules = [{ name: 'sand', expr: 'VSH < 0.3' }];
    const rows = [{ kind: 'electrofacies', properties: { source_key: faciesKey(rules) } }];
    expect(faciesState(rows, 'electrofacies', rules).state).toBe('current');
    expect(faciesState(rows, 'electrofacies', [{ name: 'sand', expr: 'VSH < 0.4' }]).state).toBe('stale');
    expect(faciesState([{ kind: 'facies', properties: {} }], 'facies', []).state).toBe('unknown');
  });
});

describe('pre-PT9a PHIE flagged wherever it is read', () => {
  const old = studioLog('PHIE', { pipeline_version: 4 });
  test('the shared rule', () => {
    expect(isPrePt9aPhie(old)).toBe(true);
    expect(isPrePt9aPhie(studioLog('PHIE', { pipeline_version: 5 }))).toBe(false);
    expect(isPrePt9aPhie(studioLog('PHIT', { pipeline_version: 4 }))).toBe(false);
    expect(isPrePt9aPhie({ mnemonic: 'PHIE', provenance: { computed: true, engine: 'rock-physics', pipeline_version: 1 } })).toBe(false);
    expect(isPrePt9aZone({ pipeline_version: 4, phi_avg: 0.2 })).toBe(true);
    expect(isPrePt9aZone({ pipeline_version: 6, phi_avg: 0.2 })).toBe(false);
    expect(publishedSummary([old], { params: DEFAULT_PARAMS, zoneParams: {}, projectId: 'p1' }).oldPhie).toBe(1);
  });

  test('in the workstation: stale after a parameter change, Republish replaces the old PHIE', async () => {
    const backend = makeInMemoryBackend();
    const well = (await backend.listWells()).find((w) => w.name === 'KETA TYPE-1');
    // an old PHIE the Studio published under pipeline 4 (another, older interpretation)
    const [phie] = await backend.publishCurves(well.id, [{
      mnemonic: 'PHIE', unit: 'V/V', data: new Float32Array((await backend.listLogs(well.id))[0].n_samples).fill(0.2),
      startMdM: 2000, stopMdM: 2100, stepM: 0.5, nSamples: (await backend.listLogs(well.id))[0].n_samples, nullCount: 0,
      provenance: { computed: true, engine: 'petrophysics-studio', pipeline_version: 4, project_id: 'old-project', params: {} },
    }], 'old-project');
    render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
    const rows = await screen.findAllByTestId('petro-well-row', {}, { timeout: 30000 });
    fireEvent.click(rows.find((r) => /KETA TYPE-1/.test(r.textContent)));
    await screen.findByTestId('petro-zone-net-SAND A', {}, { timeout: 10000 });
    expect(screen.getByTestId(`petro-published-PHIE`).getAttribute('data-state')).toBe('old-phie');
    fireEvent.click(screen.getByTestId('petro-republish'));
    await waitFor(() => expect(screen.getByTestId('petro-status').textContent).toMatch(/Removed 1 PHIE row published before 2026-09-07/), { timeout: 15000 });
    const logs = await backend.listLogs(well.id);
    expect(logs.find((l) => l.id === phie.id)).toBeUndefined();
    await waitFor(() => expect(screen.getByTestId('petro-published-PHIE').getAttribute('data-state')).toBe('current'));
    // move a parameter: every published curve turns stale and says why
    fireEvent.change(screen.getByTestId('petro-param-rw'), { target: { value: '0.04' } });
    fireEvent.click(screen.getByTestId('petro-params-apply'));
    await waitFor(() => expect(screen.getByTestId('petro-published-SW').getAttribute('data-state')).toBe('stale'));
    expect(screen.getByTestId('petro-published-summary').textContent).toMatch(/stale/);
  }, 90000);
});
