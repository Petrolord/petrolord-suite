/**
 * Wells on the seismic (tester feedback 2026-09-22). A well that cannot
 * be drawn says why (explorer badge + reason), a well with checkshots
 * draws on an inline in time through them, and the projection distance
 * sets how far from a section a well still draws. Frame: the dome_ieee
 * golden (32 x 32 bins of 25 m, 64 samples @ 4 ms).
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import {
  buildWellSections, wellSectionMarks, corridorCells, WELL_REASONS, DEFAULT_CORRIDOR_CELLS,
} from '@/pages/apps/Seismolord/lib/wellDisplay';
import { makeTvdssToTwt } from '@/pages/apps/Seismolord/engine/wellSection';
import { surveyAffine } from '@/pages/apps/Seismolord/engine/surveyGeometry';
import { normalizeVelocity } from '@/pages/apps/Seismolord/engine/velocityModel';
import { effectiveCheckshots } from '@/pages/apps/Seismolord/services/wellsService';
import { parseProjectionM } from '@/pages/apps/Seismolord/hooks/useWellProjection';
import SeismicExplorer from '@/pages/apps/Seismolord/components/workspace/SeismicExplorer';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const GOLDEN = JSON.parse(fs.readFileSync(path.join(
  __dirname, '..', '..', '..', '..', '..',
  'test-data', 'seismolord', 'wells', 'wells.json',
), 'utf8'));

const GEOM = { nIl: 32, nXl: 32, ns: 64 };
const DT_US = 4000;
const AFFINE = surveyAffine({ affine: GOLDEN.lattice_affines.dome_ieee });
const VELOCITY = normalizeVelocity({ v0: GOLDEN.velocity.v0, k: GOLDEN.velocity.k });
const V1 = GOLDEN.wells.find((w) => w.name === 'KETA-V1');   // vertical, IL/XL 15.5

// a visible well as useWells + placeWellsForHost hand it over
const asVisible = (w, over = {}) => ({
  id: w.name,
  name: w.name,
  color: '#22d3ee',
  surfaceX: w.surface.x,
  surfaceY: w.surface.y,
  kbM: w.kb_m,
  tdMdM: w.td_md_m,
  deviation: w.stations.length > 2 ? w.stations : [],
  tops: w.tops.map((t) => ({ name: t.name, md: t.md_m })),
  checkshots: w.checkshots,
  ...over,
});

const build = (wells, velocity = null) => buildWellSections({
  wells,
  geom: GEOM,
  dtUs: DT_US,
  affine: AFFINE,
  velocity,
  checkshotsOf: (w) => effectiveCheckshots(w).rows,
});

describe('a well without a time-depth relationship', () => {
  test('is not drawn and carries the explanatory message', () => {
    const { sections, skipped } = build([asVisible(V1, { checkshots: [] })]);
    expect(sections).toEqual([]);
    expect(skipped).toEqual([{
      id: 'KETA-V1', name: 'KETA-V1', code: 'noTdr', reason: WELL_REASONS.noTdr,
    }]);
    expect(WELL_REASONS.noTdr).toMatch(/no time-depth relationship; add checkshots or a time-depth table in Well Data Manager/i);
  });

  test('the explorer row shows the message on a warning badge', () => {
    const { skipped } = build([asVisible(V1, { checkshots: [] })]);
    const status = { [skipped[0].id]: { drawn: false, code: skipped[0].code, reason: skipped[0].reason } };
    render(
      <MemoryRouter>
        <SeismicExplorer
          tree={{
            volumes: [], activeVolumeId: 'v1', horizons: [], visibleIds: new Set(),
            faults: [], visibleFaultIds: new Set(), savedTraverses: [],
            wells: [{ id: 'KETA-V1', name: 'KETA-V1', td_md_m: 400 }],
            visibleWellIds: new Set(['KETA-V1']),
            wellDrawStatus: status,
            slicePlanes: [], horizonColorById: {},
          }}
          actions={new Proxy({}, { get: () => jest.fn() })}
        />
      </MemoryRouter>,
    );
    const badge = screen.getByTestId('sl-well-warn-KETA-V1');
    expect(badge).toHaveAttribute('title', WELL_REASONS.noTdr);
    const row = screen.getByText('KETA-V1').closest('[role="button"]');
    expect(row.getAttribute('title')).toMatch(/Not drawn on the seismic\. No time-depth relationship/);
  });

  test('a hidden well shows no badge', () => {
    render(
      <MemoryRouter>
        <SeismicExplorer
          tree={{
            volumes: [], activeVolumeId: 'v1', horizons: [], visibleIds: new Set(),
            faults: [], visibleFaultIds: new Set(), savedTraverses: [],
            wells: [{ id: 'KETA-V1', name: 'KETA-V1' }],
            visibleWellIds: new Set(),
            wellDrawStatus: { 'KETA-V1': { drawn: false, reason: WELL_REASONS.noTdr } },
            slicePlanes: [], horizonColorById: {},
          }}
          actions={new Proxy({}, { get: () => jest.fn() })}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('sl-well-warn-KETA-V1')).toBeNull();
  });

  test('a volume velocity model gives it a time-depth relationship (no default velocity otherwise)', () => {
    const { sections, skipped } = build([asVisible(V1, { checkshots: [] })], VELOCITY);
    expect(skipped).toEqual([]);
    expect(sections[0].source).toBe('model');
  });
});

describe('a well with checkshots', () => {
  test('draws on an inline in time through its checkshots', () => {
    const { sections, skipped } = build([asVisible(V1)]);
    expect(skipped).toEqual([]);
    const w = sections[0];
    expect(w.source).toBe('checkshots');
    const inline = 16;                                 // the well sits at IL 15.5
    const { path: proj, tops } = wellSectionMarks(w, 'inline', inline);
    const drawn = proj.filter(Boolean);
    expect(drawn.length).toBeGreaterThan(5);
    // every drawn vertex is a TWT sample on the section, at the well's XL
    const conv = makeTvdssToTwt({ checkshots: V1.checkshots, dtUs: DT_US, maxTwtMs: 252 });
    for (const q of drawn) {
      expect(q.s).toBeGreaterThanOrEqual(0);
      expect(q.s).toBeLessThan(GEOM.ns);
      expect(q.trace).toBeCloseTo(15.5, 6);
    }
    // and the time is the checkshot time at that depth (not a model)
    const i = proj.findIndex(Boolean);
    const pt = w.points[i];
    expect(proj[i].s).toBeCloseTo(conv.toTwtMs(pt.tvdss) / (DT_US / 1000), 9);
    // tops draw as markers on the section
    expect(tops.map((t) => t.name)).toEqual(['Dome']);
  });

  test('a committed tie-derived set wins over the imported checkshots', () => {
    const derived = V1.checkshots.map((c) => ({ ...c, twt_ms: c.twt_ms + 8 }));
    const base = build([asVisible(V1)]).sections[0];
    const tied = build([asVisible(V1, { checkshots_derived: { rows: derived } })]).sections[0];
    const i = base.points.findIndex((q) => q.s != null && q.s < 60);
    expect(tied.points[i].s - base.points[i].s).toBeCloseTo(2, 6);   // 8 ms = 2 samples
  });
});

describe('other reasons are named too', () => {
  test('outside the time window, outside the survey, no path', () => {
    const late = V1.checkshots.map((c) => ({ ...c, twt_ms: c.twt_ms + 5000 }));
    const { skipped } = build([
      asVisible(V1, { id: 'late', checkshots: late }),
      asVisible(V1, { id: 'far', surfaceX: V1.surface.x + 50000 }),
      asVisible(V1, { id: 'nopath', tdMdM: 0, deviation: [] }),
    ]);
    expect(skipped.map((k) => [k.id, k.code])).toEqual([
      ['late', 'outsideWindow'], ['far', 'outsideArea'], ['nopath', 'noPath'],
    ]);
    for (const k of skipped) expect(k.reason).toBe(WELL_REASONS[k.code]);
  });
});

describe('well projection distance', () => {
  test('metres convert to bins per section orientation', () => {
    expect(corridorCells(null, AFFINE)).toEqual({ inline: DEFAULT_CORRIDOR_CELLS, xline: DEFAULT_CORRIDOR_CELLS });
    expect(corridorCells(150, AFFINE)).toEqual({ inline: 6, xline: 6 });   // 25 m bins
    expect(parseProjectionM('')).toBeNull();
    expect(parseProjectionM('-3')).toBeNull();
    expect(parseProjectionM('250')).toBe(250);
  });

  test('a well 4.5 bins off the inline draws only when the distance reaches it', () => {
    const w = build([asVisible(V1)]).sections[0];
    expect(wellSectionMarks(w, 'inline', 20).path).toBeNull();
    const wide = corridorCells(150, AFFINE);
    const marks = wellSectionMarks(w, 'inline', 20, wide.inline);
    expect(marks.path.filter(Boolean).length).toBeGreaterThan(5);
    expect(marks.tops).toHaveLength(1);
  });
});
