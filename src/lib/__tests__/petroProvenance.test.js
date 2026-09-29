/**
 * PETRO-U2-013 (decision on PETRO-U1-026, 2026-09-29): a PHIE the
 * Petrophysics Studio published before PT9a (pipeline below 5) is total
 * porosity. The rows are not rewritten; every reader flags them.
 * Negative control (run 2026-09-29): with isPrePt9aPhie returning false the
 * WDM badge and the Data AI picker lose the flag and both cases fail.
 */
import { isPrePt9aPhie, isPrePt9aZone, PRE_PT9A_PHIE_NOTE } from '@/lib/petroProvenance';
import { curveOrigin } from '@/pages/apps/WellDataManager/engine/provenance';

jest.mock('@/lib/wellsRegistry', () => ({
  listWells: jest.fn(), downloadCurve: jest.fn(), saveLog: jest.fn(),
  listLogs: jest.fn(async (id) => (id === 'w1'
    ? [{ mnemonic: 'DEPT' }, { mnemonic: 'PHIE', unit: 'V/V', provenance: { computed: true, engine: 'petrophysics-studio', pipeline_version: 4 } }]
    : [{ mnemonic: 'DEPT' }, { mnemonic: 'PHIE', unit: 'V/V', provenance: { computed: true, engine: 'petrophysics-studio', pipeline_version: 7 } }])),
}));
// eslint-disable-next-line import/first
import { curveInventory } from '@/utils/dataAi/mlSources';

const old = { mnemonic: 'PHIE', provenance: { computed: true, engine: 'petrophysics-studio', pipeline_version: 4, interpretation_name: 'Base' } };

test('the rule: Studio PHIE below pipeline 5 only', () => {
  expect(isPrePt9aPhie(old)).toBe(true);
  expect(isPrePt9aPhie({ ...old, mnemonic: 'PHIE:1' })).toBe(true);
  expect(isPrePt9aPhie({ ...old, provenance: { ...old.provenance, pipeline_version: 5 } })).toBe(false);
  expect(isPrePt9aPhie({ mnemonic: 'PHIE', provenance: {} })).toBe(false);
  expect(isPrePt9aZone({ pipeline_version: 3, phi_avg: 0.2 })).toBe(true);
  expect(isPrePt9aZone({ phi_avg: 0.2 })).toBe(false);
});

test('Well Data Manager badge says total porosity', () => {
  const o = curveOrigin(old);
  expect(o).toMatchObject({ label: 'computed, total porosity', stale: true });
  expect(o.title).toContain(PRE_PT9A_PHIE_NOTE);
  expect(curveOrigin({ ...old, provenance: { ...old.provenance, pipeline_version: 7 } }).label).toBe('computed');
});

test('Data AI curve picker names the wells whose PHIE is total porosity', async () => {
  const inv = await curveInventory([{ id: 'w1', name: 'OLD-1' }, { id: 'w2', name: 'NEW-2' }]);
  const phie = inv.find((c) => c.name === 'PHIE');
  expect(phie.wells).toEqual(['OLD-1', 'NEW-2']);
  expect(phie.totalPorosityWells).toEqual(['OLD-1']);
});
