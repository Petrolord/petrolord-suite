// In-memory Supabase mock — a thenable query builder over a row array.
const store = { rows: [], seq: 0 };

jest.mock('@/lib/customSupabaseClient', () => {
    const resolve = (st) => {
        if (st.op === 'insert') {
            const row = { id: `id-${++store.seq}`, created_at: `2026-01-0${store.seq}T00:00:00Z`, ...st.payload };
            store.rows.push(row);
            return { data: st.single ? row : [row], error: null };
        }
        if (st.op === 'update') {
            const row = store.rows.find((r) => r.id === st.id);
            if (row) Object.assign(row, st.payload);
            return { data: row, error: null };
        }
        if (st.op === 'delete') {
            store.rows = store.rows.filter((r) => r.id !== st.id);
            return { data: null, error: null };
        }
        return { data: [...store.rows], error: null }; // select
    };
    const makeBuilder = () => {
        const st = { op: null, payload: null, id: null, single: false };
        const b = {
            insert(rows) { st.op = 'insert'; [st.payload] = rows; return b; },
            update(row) { st.op = 'update'; st.payload = row; return b; },
            delete() { st.op = 'delete'; return b; },
            select() { return b; },
            order() { return b; },
            eq(_col, val) { st.id = val; return b; },
            single() { st.single = true; return b; },
            then(onF, onR) { return Promise.resolve(resolve(st)).then(onF, onR); },
        };
        return b;
    };
    return { supabase: { from: () => makeBuilder() } };
});

import { ProjectService, friendlyError } from '@/pages/apps/ReservoirCalcPro/services/ProjectService';

beforeEach(() => { store.rows = []; store.seq = 0; });

const sampleProject = (over = {}) => ({
    user_id: 'user-1',
    name: 'North Field',
    description: 'Base case',
    unitSystem: 'field',
    calcMethod: 'deterministic',
    inputMethod: 'simple',
    inputs: { deterministic: { area: 1000, porosity: 0.2, fluidType: 'oil' }, surfaces: [], polygons: [] },
    results: { stooip: 45_000_000 },
    ...over,
});

describe('ProjectService round-trip', () => {
    it('saves a new project and maps it back with name/description/version/inputs intact', async () => {
        const saved = await ProjectService.saveProject(sampleProject(), true);
        expect(saved.name).toBe('North Field');
        expect(saved.version).toBe(1);

        const projects = await ProjectService.getProjects();
        expect(projects).toHaveLength(1);
        const p = projects[0];
        expect(p.name).toBe('North Field');
        expect(p.description).toBe('Base case');
        expect(p.inputs.deterministic.fluidType).toBe('oil');
        expect(p.results.stooip).toBe(45_000_000);
        expect(p.unitSystem).toBe('field');
    });

    it('stores the payload inside inputs_data (not as extra columns)', async () => {
        await ProjectService.saveProject(sampleProject(), true);
        const row = store.rows[0];
        expect(row.project_name).toBe('North Field');
        expect(row.inputs_data.description).toBe('Base case');
        expect(row.inputs_data.inputs.deterministic.area).toBe(1000);
        expect(row.results_data.stooip).toBe(45_000_000);
    });

    it('bumps version on update', async () => {
        const saved = await ProjectService.saveProject(sampleProject(), true);
        const updated = await ProjectService.saveProject({ ...sampleProject({ id: saved.id, version: saved.version }), name: 'North Field v2' }, false);
        expect(updated.version).toBe(2);
        expect(updated.name).toBe('North Field v2');
        const projects = await ProjectService.getProjects();
        expect(projects).toHaveLength(1); // updated in place, not duplicated
    });

    it('deletes a project', async () => {
        const saved = await ProjectService.saveProject(sampleProject(), true);
        await ProjectService.deleteProject(saved.id);
        expect(await ProjectService.getProjects()).toHaveLength(0);
    });

    it('rejects saving without a signed-in user', async () => {
        await expect(ProjectService.saveProject({ ...sampleProject(), user_id: undefined }, true)).rejects.toThrow(/sign in/i);
    });
});

describe('friendlyError', () => {
    it('maps a missing-table (42P01) error to a deploy hint', () => {
        expect(friendlyError({ code: '42P01', message: 'relation "public.saved_quickvol_projects" does not exist' }))
            .toMatch(/migration/i);
    });
    it('passes other errors through', () => {
        expect(friendlyError({ message: 'network down' })).toBe('network down');
    });
});
