// U2-001 prospect-ready picture: templates, legend, company and analyst.
import {
  sectionDrawn, templateCheck, legendEntries, legendLayout, normalizePlotIdentity,
  identityFromUser, authIdentityStore, PLOT_IDENTITY_KEY, LEGEND_MM,
} from '@/pages/apps/Seismolord/lib/plotTemplates';
import { paperLayout, titleBlockRows } from '@/pages/apps/Seismolord/lib/plotComposer';

const NULL = Math.fround(1.0e30);
const geom = { nIl: 20, nXl: 30 };

function horizon(name, fill) {
  const grid = new Float32Array(geom.nIl * geom.nXl).fill(NULL);
  fill(grid);
  return { id: name, name, grid, color: '#22c55e' };
}

const wellAt = (il, xl, name = 'W-1') => ({
  id: name,
  name,
  color: '#fbbf24',
  points: Array.from({ length: 20 }, (_, k) => ({ il, xl, s: 5 + k })),
  tops: [],
});

describe('sectionDrawn: the legend lists what the line shows', () => {
  const full = horizon('Top Reservoir', (g) => g.fill(10));
  // live only on inline 3
  const partial = horizon('Base Seal', (g) => { for (let x = 0; x < geom.nXl; x++) g[3 * geom.nXl + x] = 12; });
  const overlays = {
    horizons: [full, partial, { id: '__draft', name: 'New horizon (editing)', grid: full.grid }],
    faults: [
      { name: 'F1', color: '#f97316', sticks: [{ points: [{ il: 8, xl: 4, s: 1 }, { il: 8, xl: 5, s: 9 }] }] },
      { name: 'F2', color: '#ef4444', sticks: [{ points: [{ il: 15, xl: 4, s: 1 }, { il: 15, xl: 5, s: 9 }] }] },
    ],
    wells: [wellAt(8, 12, 'W-1'), wellAt(17, 25, 'W-2')],
  };

  test('inline 8: the full horizon, F1 and W-1 only', () => {
    const d = sectionDrawn({ overlays, orientation: 'inline', sliceIndex: 8, geom });
    expect(d.horizons.map((h) => h.name)).toEqual(['Top Reservoir']);
    expect(d.faults.map((f) => f.name)).toEqual(['F1']);
    expect(d.wells.map((w) => w.name)).toEqual(['W-1']);
  });

  test('inline 3: the partial horizon is on it, no well', () => {
    const d = sectionDrawn({ overlays, orientation: 'inline', sliceIndex: 3, geom });
    expect(d.horizons.map((h) => h.name).sort()).toEqual(['Base Seal', 'Top Reservoir']);
    expect(d.wells).toEqual([]);
  });

  test('crossline 25 passes W-2; a time slice reports nothing', () => {
    expect(sectionDrawn({ overlays, orientation: 'xline', sliceIndex: 25, geom }).wells.map((w) => w.name)).toEqual(['W-2']);
    expect(sectionDrawn({ overlays, orientation: 'time', sliceIndex: 10, geom })).toEqual({ horizons: [], faults: [], wells: [] });
  });

  test('traverse through W-2 only', () => {
    const positions = Array.from({ length: 10 }, (_, k) => ({ il: 17, xl: 20 + k }));
    const d = sectionDrawn({ overlays, orientation: 'traverse', sliceIndex: 0, geom, positions });
    expect(d.wells.map((w) => w.name)).toEqual(['W-2']);
  });
});

describe('templateCheck: a template that is not satisfied says what is missing', () => {
  test('section with a well needs a well on the line (negative control)', () => {
    const none = templateCheck('section_well', { kind: 'section', drawn: { wells: [] } });
    expect(none.ok).toBe(false);
    expect(none.problems[0]).toMatch(/No well is drawn on this line/);
    expect(templateCheck('section_well', { kind: 'section', drawn: { wells: [{ name: 'W-1' }] } }).ok).toBe(true);
    expect(templateCheck('section_well', { kind: 'timeslice', drawn: {} }).problems[0]).toMatch(/time slice has no well track/);
  });

  test('map with contours and wells needs both', () => {
    const r = templateCheck('map_contours_wells', { kind: 'map', drawn: { contours: null, wells: [] } });
    expect(r.problems).toHaveLength(2);
    expect(templateCheck('map_contours_wells', {
      kind: 'map', drawn: { contours: { step: 10, unit: 'ms' }, wells: [{ name: 'A' }] },
    }).ok).toBe(true);
    expect(templateCheck('current', { kind: 'map', drawn: {} }).ok).toBe(true);
    expect(templateCheck('map_contours_wells', null).ok).toBe(false);
  });
});

describe('legend', () => {
  const drawn = {
    horizons: [{ name: 'Top Reservoir', color: '#22c55e' }],
    faults: [{ name: 'F1', color: '#f97316' }],
    wells: [{ name: 'W-1', color: '#fbbf24' }],
    contours: { name: 'Top Reservoir', step: 25, unit: 'ms' },
  };

  test('entries in kind order, contour interval stated', () => {
    const e = legendEntries(drawn);
    expect(e.map((x) => x.kind)).toEqual(['horizon', 'fault', 'well', 'contours']);
    expect(e[3].label).toBe('Top Reservoir, interval 25 ms');
  });

  test('layout fits in its box and counts what does not fit', () => {
    const many = { wells: Array.from({ length: 80 }, (_, k) => ({ name: `W-${k}`, color: '#ffffff' })) };
    const box = { x: 0, y: 0, w: 46, h: 100 };
    const { items, omitted } = legendLayout(legendEntries(many), box);
    expect(omitted).toBeGreaterThan(0);
    expect(items.filter((i) => i.type === 'row').length + omitted).toBe(80);
    expect(Math.max(...items.map((i) => i.y))).toBeLessThan(box.h);
  });

  test('paper layout makes room for the legend beside the image', () => {
    const l = paperLayout('a4', 'landscape', { legendMm: LEGEND_MM });
    expect(l.imageBox.w + l.legendBox.w).toBeCloseTo(l.frame.w, 9);
    expect(l.legendBox.x).toBeCloseTo(l.imageBox.x + l.imageBox.w, 9);
    expect(paperLayout('a4', 'landscape').legendBox).toBeNull();
  });
});

describe('company and analyst, saved per user', () => {
  test('title block carries them; empty values drop', () => {
    const rows = titleBlockRows({
      title: 'Prospect A', company: 'Lordsway Energy', analyst: 'A. Analyst', scaleText: '1:25,000',
    });
    expect(rows.find(([k]) => k === 'Company')[1]).toBe('Lordsway Energy');
    expect(rows.find(([k]) => k === 'Analyst')[1]).toBe('A. Analyst');
    expect(titleBlockRows({ scaleText: '1:1000' }).find(([k]) => k === 'Company')).toBeUndefined();
  });

  test('hostile input is cleaned (PL2)', () => {
    const id = normalizePlotIdentity({ company: '  Acme\n\tOil   Ltd ', analyst: 'x'.repeat(500) });
    expect(id.company).toBe('Acme Oil Ltd');
    expect(id.analyst).toHaveLength(80);
    expect(normalizePlotIdentity(null)).toEqual({ company: '', analyst: '' });
  });

  test('read from the account metadata; the profile name is the default analyst', () => {
    expect(identityFromUser({ user_metadata: { display_name: 'Ayo' } })).toEqual({ company: '', analyst: 'Ayo' });
    expect(identityFromUser({
      user_metadata: { display_name: 'Ayo', [PLOT_IDENTITY_KEY]: { company: 'LE', analyst: 'A. Asaolu' } },
    })).toEqual({ company: 'LE', analyst: 'A. Asaolu' });
  });

  test('the auth store writes one metadata key and reads it back', async () => {
    let meta = { display_name: 'Ayo' };
    const fake = {
      auth: {
        getUser: async () => ({ data: { user: { user_metadata: meta } } }),
        updateUser: async ({ data }) => { meta = { ...meta, ...data }; return { error: null }; },
      },
    };
    const store = authIdentityStore(fake);
    await store.save({ company: ' Lordsway ', analyst: 'A. Analyst' });
    expect(meta.display_name).toBe('Ayo');
    expect(meta[PLOT_IDENTITY_KEY]).toEqual({ company: 'Lordsway', analyst: 'A. Analyst' });
    expect(await store.load()).toEqual({ company: 'Lordsway', analyst: 'A. Analyst' });
  });
});
