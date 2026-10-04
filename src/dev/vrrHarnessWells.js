// Dev-only: wells registry rows (geo_wells) for the /dev/studio/vrr harness,
// so the bubble map's match table (VRR-U2-004) can be walked and tested.
// The sample ledger's four wells, under registry names that exercise each
// proposal rule (same name, same UWI, same letters and digits), plus the
// demo field's wells when it exists. Never imported by production routes.
import { DEV_USER } from './InMemorySupabase';
import { DEMO_LOCATIONS } from '@/utils/vrr/demoField';

const TS = '2026-10-04T00:00:00.000Z';
const row = (id, name, uwi, x, y) => ({
  id, user_id: DEV_USER.id, organization_id: null, name, uwi, surface_x: x, surface_y: y, kb_m: 0,
  crs: 'EPSG:26332', xy_unit: 'm', created_at: TS, updated_at: TS,
});

export const SAMPLE_REGISTRY = Object.freeze([
  row('hw-p1', 'P-1', 'NG-0001', 500000, 120000),
  row('hw-p2', 'P2', 'NG-0002', 501200, 120400),
  row('hw-i1', 'Injector 1', 'I-1', 500600, 119500),
]);

// VRR-U2-005: the demo field's wells at their line-drive locations
export const DEMO_REGISTRY = Object.freeze(DEMO_LOCATIONS.map(([name, x, y], i) => row(`hw-d${i}`, name, null, x, y)));

export const harnessRegistry = (extra = []) => [...SAMPLE_REGISTRY, ...DEMO_REGISTRY, ...extra].map((r) => ({ ...r }));
