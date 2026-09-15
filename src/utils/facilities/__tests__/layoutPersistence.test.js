// FC1-0: the spacing inputs are saved inside facility_layouts.layout_data.
import { openStateRow, stampState, isNewerStateError, openState } from '@/lib/stateVersion';
import {
  FACILITY_LAYOUT_KIND, FACILITY_LAYOUT_STATE_VERSION, buildLayoutData, readLayoutData,
} from '../layoutPersistence';
import { DEFAULT_SPACING_INPUTS } from '../layoutSpacing';

const layers = [{ id: 'a', type: 'icon', iconName: 'Tank', tag: 'Tank-001', latlng: { lat: 1, lng: 2 } }];

describe('facility layout persistence', () => {
  test('a save carries the layers and the spacing inputs, and reads back unchanged', () => {
    const spacingInputs = { ...DEFAULT_SPACING_INPUTS, poolEnabled: true, poolAllowableKwM2: '1.58', flareLhvKjKg: '' };
    const row = stampState(FACILITY_LAYOUT_KIND, {
      project_name: 'x', layout_data: buildLayoutData({ layers, spacingInputs }),
    });
    expect(row.schema_version).toBe(FACILITY_LAYOUT_STATE_VERSION);
    const stored = JSON.parse(JSON.stringify(row));
    const back = readLayoutData(openStateRow(FACILITY_LAYOUT_KIND, stored).layout_data);
    expect(back.layers).toEqual(layers);
    expect(back.spacingInputs.poolAllowableKwM2).toBe('1.58');
    expect(back.spacingInputs.poolEnabled).toBe(true);
    // a cleared field stays cleared across a save
    expect(back.spacingInputs.flareLhvKjKg).toBe('');
  });

  test('a version 1 row (bare layer array) opens with the initial inputs', () => {
    const v1 = { layout_data: layers };
    const opened = openState(FACILITY_LAYOUT_KIND, v1);
    expect(opened.migrated).toBe(true);
    const back = readLayoutData(opened.row.layout_data);
    expect(back.layers).toEqual(layers);
    expect(back.spacingInputs).toEqual(DEFAULT_SPACING_INPUTS);
  });

  test('an unstamped row already in the object shape is not wrapped twice', () => {
    const unstamped = { layout_data: buildLayoutData({ layers, spacingInputs: { poolDiameterM: '35' } }) };
    const back = readLayoutData(openStateRow(FACILITY_LAYOUT_KIND, unstamped).layout_data);
    expect(back.layers).toEqual(layers);
    expect(back.spacingInputs.poolDiameterM).toBe('35');
  });

  test('negative control: a row from a newer build is refused', () => {
    let err;
    try {
      openStateRow(FACILITY_LAYOUT_KIND, { schema_version: FACILITY_LAYOUT_STATE_VERSION + 1, layout_data: {} });
    } catch (e) { err = e; }
    expect(isNewerStateError(err)).toBe(true);
  });

  test('garbage layout_data reads as an empty layout', () => {
    expect(readLayoutData(null).layers).toEqual([]);
    expect(readLayoutData({ layers: 'nope' }).layers).toEqual([]);
  });
});
