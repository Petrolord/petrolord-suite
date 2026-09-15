// FC1-0: pipeline tags are sequential and deterministic, like equipment tags.
import fs from 'fs';
import path from 'path';
import { nextTagNumber, nextEquipmentTag, nextPipelineTag } from '../layoutTags';

describe('layout tags', () => {
  test('a first pipeline is PL-001 and the next is PL-002', () => {
    expect(nextPipelineTag([])).toBe('PL-001');
    expect(nextPipelineTag([{ type: 'pipeline', tag: 'PL-001' }])).toBe('PL-002');
  });

  test('fills the lowest gap, and a reloaded layout gives the same answer every time', () => {
    const layers = [
      { type: 'pipeline', tag: 'PL-001' },
      { type: 'pipeline', tag: 'PL-003' },
    ];
    expect(nextPipelineTag(layers)).toBe('PL-002');
    const reloaded = JSON.parse(JSON.stringify(layers));
    expect(nextPipelineTag(reloaded)).toBe('PL-002');
  });

  test('never collides with a legacy random tag already on the map', () => {
    const layers = Array.from({ length: 5 }, (_, i) => ({ type: 'pipeline', tag: `PL-${i + 1}` }))
      .concat([{ type: 'pipeline', tag: 'PL-532' }]);
    const tag = nextPipelineTag(layers);
    expect(tag).toBe('PL-006');
    expect(layers.map((l) => l.tag)).not.toContain(tag);
  });

  test('negative control: other prefixes and renamed tags do not use up numbers', () => {
    const layers = [
      { type: 'icon', tag: 'Pump-001' },
      { type: 'pipeline', tag: 'PL-Main header' },
      { type: 'pipeline', tag: 'PLX-001' },
    ];
    expect(nextTagNumber(layers, 'PL')).toBe(1);
    expect(nextEquipmentTag(layers, 'Pump')).toBe('Pump-002');
  });

  test('the map no longer draws pipeline tags from Math.random', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../components/facilitylayoutmapper/MapPanel.jsx'), 'utf8',
    );
    expect(src).not.toMatch(/Math\.random/);
    expect(src).toMatch(/nextPipelineTag\(prevLayers\)/);
  });
});
