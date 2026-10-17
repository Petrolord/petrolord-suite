// Guided Journey stage 1 guard: the migration's work sources must cover every
// app table the Suite moves between projects (projectsService APP_MOVABLE and
// MOVABLE), apart from the tables named below with the reason. A new app
// table added to APP_MOVABLE without a work source fails here, so its users
// are never told "start your first piece of work" after they have.
import fs from 'fs';
import path from 'path';
import { APP_MOVABLE, MOVABLE } from '../../projects/projectsService';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const MIGRATION = path.join(__dirname, '../../../../supabase/migrations/20261017100000_suite_user_journey.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8');
const seed = sql.slice(sql.indexOf('insert into public.suite_journey_work_sources'), sql.indexOf('on conflict (app_id, table_name)'));
const rows = [...seed.matchAll(/\('([a-z0-9-]+)', '([a-z0-9_]+)', '([a-z-]+)', '(data|case)', '(user_id|created_by)', (null|'suite_project_id')\)/g)]
  .map(([, app, table, discipline, kind, owner, project]) => ({ app, table, discipline, kind, owner, project: project === 'null' ? null : 'suite_project_id' }));

// not work sources, with the reason (keep in step with the migration's comment)
const EXCLUDED = {
  geo_culture: 'shared culture layers, written by several apps',
  po_fields: 'the production spine, shared by eleven apps',
  saved_casing_design_projects: 'legacy, no app reads it',
  saved_compressor_pump_projects: 'legacy, no app reads it',
  saved_drilling_fluids_projects: 'legacy, no app reads it',
  saved_mbal_projects: 'legacy, no app reads it',
  saved_petrophysics_projects: 'legacy, no app reads it',
  saved_pvt_projects: 'legacy, no app reads it',
  saved_reservoir_balance_projects: 'legacy, no app reads it',
  saved_well_cost_iq_projects: 'legacy, no app reads it',
  saved_well_cost_projects: 'legacy, no app reads it',
  saved_pipeline_sizer_projects: 'legacy, no app reads it',
};
const DISCIPLINES = ['geoscience', 'reservoir', 'drilling', 'production', 'facilities', 'process-safety',
  'midstream-downstream', 'economics', 'assurance', 'data-ai', 'management'];

describe('journey work sources', () => {
  test('the seed parses (83 sources over 79 apps)', () => {
    expect(rows.length).toBe(83);
    expect(new Set(rows.map((r) => r.app)).size).toBe(79);
  });

  test('every movable app table is a work source or excluded with a reason', () => {
    const seeded = new Set(rows.map((r) => r.table));
    const missing = [...APP_MOVABLE, ...MOVABLE].map((m) => m.table).filter((t) => !seeded.has(t) && !EXCLUDED[t]);
    expect(missing).toEqual([]);
  });

  test('nothing excluded is seeded, and every exclusion is still a movable table', () => {
    const movable = new Set([...APP_MOVABLE, ...MOVABLE].map((m) => m.table));
    for (const t of Object.keys(EXCLUDED)) {
      expect(rows.some((r) => r.table === t)).toBe(false);
      expect(movable.has(t)).toBe(true);
    }
  });

  test('movable tables carry the project column; disciplines are known keys', () => {
    const movable = new Set([...APP_MOVABLE, ...MOVABLE].map((m) => m.table));
    for (const r of rows) {
      expect(DISCIPLINES).toContain(r.discipline);
      if (movable.has(r.table)) expect(r.project).toBe('suite_project_id');
    }
    expect(sql).toContain(DISCIPLINES.map((d) => `'${d}'`).join(', ').slice(0, 60));
  });

  test('negative control: a seed without Well Design Studio fails the coverage check', () => {
    const seeded = new Set(rows.filter((r) => r.table !== 'wp_sites').map((r) => r.table));
    const missing = [...APP_MOVABLE, ...MOVABLE].map((m) => m.table).filter((t) => !seeded.has(t) && !EXCLUDED[t]);
    expect(missing).toEqual(['wp_sites']);
  });
});
