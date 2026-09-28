/**
 * WDM-U1-009: LAS 3.0 ~Tops_Data becomes registry tops (it was named as an
 * ignored block and dropped). Negative control: the log reader alone leaves
 * the block in ignoredSections and returns no tops.
 */
import fs from 'fs';
import path from 'path';
import { parseLas } from '../engine/lasParse';
import { topsFromLasBlocks } from '../engine/lasTops';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'hostile');

test('the hostile LAS 3.0 file yields its two tops in metres MD', () => {
  const parsed = parseLas(fs.readFileSync(path.join(HOSTILE, 'las30_tops_strings.las'), 'utf8'));
  expect(parsed.ignoredSections).toContain('Tops'); // what the reader alone does
  const out = topsFromLasBlocks(parsed.blocks);
  expect(out.block).toBe('Tops');
  expect(out.tops).toEqual([{ name: 'Upper Sand', md: 1501 }, { name: 'Lower Shale', md: 1503.25 }]);
  expect(out.skipped).toEqual([]);
});

const block = (columns, rows) => ({ Tops: { name: 'Tops', columns, rows, params: {} } });

test('feet convert; unnamed and non-numeric rows are reported, never dropped silently', () => {
  const out = topsFromLasBlocks(block(
    [{ mnemonic: 'TOPN', unit: '', format: 'S' }, { mnemonic: 'TOPT', unit: 'F', format: 'F' }],
    [['A', '1000'], ['', '1100'], ['B', 'n/a'], ['C', '1200,5']],
  ));
  expect(out.tops.map((t) => t.name)).toEqual(['A', 'C']);
  expect(out.tops[0].md).toBeCloseTo(304.8, 9);
  expect(out.tops[1].md).toBeCloseTo(1200.5 * 0.3048, 9);
  expect(out.skipped).toEqual(['row 2: no top name', 'row 3 (B): depth "n/a" is not a number']);
});

test('a tops block in TVDSS is refused with the reason', () => {
  const out = topsFromLasBlocks(block(
    [{ mnemonic: 'TOPN', unit: '', format: 'S' }, { mnemonic: 'TVDSS', unit: 'M', format: 'F' }],
    [['A', '1000']],
  ));
  expect(out.tops).toEqual([]);
  expect(out.skipped[0]).toMatch(/vertical depth; tops are stored in MD/);
});

test('no tops block, nothing offered', () => {
  expect(topsFromLasBlocks({ Core: { columns: [], rows: [] } })).toEqual({ tops: [], block: null, skipped: [] });
});
