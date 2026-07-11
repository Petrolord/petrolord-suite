// Guard the Seismolord colormap catalogue: every offered key must resolve
// in the shared registry and produce a full, valid 256-entry LUT — a
// broken map function would otherwise only surface as a black viewer.

import { COLOR_MAPS } from '@/utils/colorMaps';
import { SEISMIC_COLORMAPS } from '../viewer/SliceRenderer';

describe('SEISMIC_COLORMAPS', () => {
  it('offers a rich catalogue with the playbook default first', () => {
    expect(SEISMIC_COLORMAPS.length).toBeGreaterThanOrEqual(12);
    expect(SEISMIC_COLORMAPS[0].key).toBe('seismic_rwb');
    const keys = SEISMIC_COLORMAPS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(SEISMIC_COLORMAPS.map((c) => [c.key, c.label]))(
    '%s resolves and yields valid RGB across the full LUT range',
    (key) => {
      const map = COLOR_MAPS[key];
      expect(map).toBeDefined();
      for (let i = 0; i < 256; i++) {
        const rgb = map.fn(i / 255);
        expect(rgb).toHaveLength(3);
        for (const c of rgb) {
          expect(Number.isFinite(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        }
      }
    },
  );

  it('diverging amplitude maps are light at the symmetric-clip centre', () => {
    for (const key of ['seismic_rwb', 'seismic', 'red_white_black', 'cool_warm']) {
      const [r, g, b] = COLOR_MAPS[key].fn(0.5);
      expect(r + g + b).toBeGreaterThan(3 * 180);
    }
  });
});
