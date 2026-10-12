// Source freshness in ReservoirCalc Pro (2026-10-12): a project that
// averaged a registry zone says so when the zone is published again, and
// a registry surface that left the registry is said too. Through the
// shipped context, the in-memory backend and the shared notice.
// Negative control: with the registry left as it was, the zone has no
// notice and the results carry no stale mark; refresh and keep clear it.
import React from 'react';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReservoirCalcProvider, useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { makeInMemoryRcpBackend, SOURCE_CHANGED_PROJECT } from '../services/rcpBackend';
import RcpSourceNotice, { RcpStaleResultsMark } from '../components/RcpSourceNotice';
import { rcpSourceRefs } from '../services/rcpSources';
import { registryPatchForZone, areaPatchForSurface, aoiFromBoundary } from '../services/registryDoor';

jest.setTimeout(60000);

let ctx = null;
const Probe = () => { ctx = useReservoirCalc(); return null; };

async function openSourceProject(opts) {
  const backend = makeInMemoryRcpBackend({ sourceChanged: true, ...opts });
  render(
    <ReservoirCalcProvider backend={backend}>
      <Probe />
      <RcpSourceNotice />
      <RcpStaleResultsMark />
    </ReservoirCalcProvider>,
  );
  const projects = await backend.projects.getProjects();
  const p = projects.find((x) => x.name === SOURCE_CHANGED_PROJECT);
  act(() => ctx.loadProject(p));
  return backend;
}

const zoneItem = () => screen.queryAllByTestId('rcp-source-changed-item').find((el) => /^zone:/.test(el.getAttribute('data-key')));

describe('ReservoirCalc Pro: source changed', () => {
  it('no notice for an unchanged zone, and no stale mark (negative control)', async () => {
    await openSourceProject({ sourceEdits: null });
    // the deleted surface is reported; the five zones are not
    await waitFor(() => expect(screen.getAllByTestId('rcp-source-changed-item')).toHaveLength(1));
    expect(screen.getByTestId('rcp-source-changed-item')).toHaveAttribute('data-status', 'deleted');
    expect(screen.getByTestId('rcp-source-changed-item')).toHaveTextContent('Top Dome v1 (registry surface) was deleted from the registry');
    expect(zoneItem()).toBeUndefined();
    // the surface is not used by the simple method, so the results are not marked
    expect(screen.queryByTestId('rcp-source-stale')).toBeNull();
  });

  it('a republished zone shows the notice with what, when and who, and marks the results', async () => {
    await openSourceProject();
    await waitFor(() => expect(zoneItem()).toBeTruthy());
    const item = zoneItem();
    expect(item).toHaveAttribute('data-status', 'changed');
    expect(item).toHaveTextContent('Top Dome in KETA-2 (published petrophysics zone) changed after this project used it.');
    expect(item).toHaveTextContent('Used 2026-10-01 09:30 UTC. Changed 2026-10-08 14:20 UTC by Ada Colleague.');
    expect(item).toHaveTextContent(/net-to-gross 0\.65 to 0\.61; porosity 0\.25 to 0\.23/);
    expect(screen.getByTestId('rcp-source-stale')).toHaveTextContent('Computed from inputs whose source changed: Top Dome in KETA-2.');
  });

  it('Refresh from source runs the zone pull again and clears the notice and the mark', async () => {
    await openSourceProject();
    await waitFor(() => expect(zoneItem()).toBeTruthy());
    const before = ctx.state.inputs.porosity;
    await act(async () => { fireEvent.click(within(zoneItem()).getByTestId('rcp-source-changed-refresh')); });
    await waitFor(() => expect(zoneItem()).toBeUndefined());
    expect(screen.queryByTestId('rcp-source-stale')).toBeNull();
    // the average moved with KETA-2's porosity (0.25 to 0.23)
    expect(ctx.state.inputs.porosity).toBeLessThan(before);
    const wells = await ctx.backend.wells.listWellsWithTops();
    expect(ctx.state.inputs.porosity).toBeCloseTo(registryPatchForZone(wells, 'Top Dome', 'field').patch.porosity, 9);
    expect(ctx.state.auditTrail[0].action).toBe('Registry inputs refreshed');
  });

  it('Keep current values clears the notice for that version and records the decision with the project', async () => {
    await openSourceProject();
    await waitFor(() => expect(zoneItem()).toBeTruthy());
    const before = ctx.state.inputs.porosity;
    act(() => { fireEvent.click(within(zoneItem()).getByTestId('rcp-source-changed-keep')); });
    await waitFor(() => expect(zoneItem()).toBeUndefined());
    expect(ctx.state.inputs.porosity).toBe(before);
    const key = Object.keys(ctx.state.inputs.sourceKept)[0];
    expect(key).toBe('zone:map-w2-z0');
    expect(ctx.state.inputs.sourceKept[key]).toMatch(/^f:[0-9a-f]{8}$/);
  });
});

describe('the pulls record their source', () => {
  it('zone, area, surface and AOI references carry a content fingerprint', async () => {
    const backend = makeInMemoryRcpBackend();
    const wells = await backend.wells.listWellsWithTops();
    const z = registryPatchForZone(wells, 'Top Dome', 'field');
    expect(z.provenance.sources).toHaveLength(5);
    expect(z.provenance.sources[0]).toMatchObject({ key: 'zone:map-w1-z0', kind: 'geo_wells_zones', well: 'KETA-1', fingerprint: expect.stringMatching(/^f:/) });
    const [s] = (await backend.surfaces.listSurfaces()).filter((x) => x.name === 'Harness Dome');
    const grid = await backend.surfaces.downloadSurfaceGrid(s);
    const a = areaPatchForSurface(s, grid, 'field');
    expect(a.provenance.source_ref).toMatchObject({ key: `area:${s.id}`, kind: 'geo_surfaces', fingerprint: expect.stringMatching(/^f:/) });
    const [c] = await backend.culture.listCulture();
    const feats = await backend.culture.downloadCultureFeatures(c);
    const aois = aoiFromBoundary({ ...c, kind: 'boundary' }, feats.length ? feats : [{ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }]);
    expect(aois[0].source.ref).toMatchObject({ key: `aoi:${c.id}`, kind: 'geo_culture' });
    const refs = rcpSourceRefs({ inputMethod: 'simple', inputs: { registryProvenance: { zone: z.provenance, area: a.provenance } }, surfaces: {}, aois });
    expect(refs.map((r) => r.key)).toEqual([...z.provenance.sources.map((x) => x.key), `area:${s.id}`, `aoi:${c.id}`]);
    // a zone average saved before 2026-10-12 has no ids: no reference
    expect(rcpSourceRefs({ inputs: { registryProvenance: { zone: { zone: 'Keta Sand', wells: ['KETA-1'] } } } })).toEqual([]);
  });
});
