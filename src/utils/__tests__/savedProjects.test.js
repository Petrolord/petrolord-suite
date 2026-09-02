/**
 * savedProjects factory tests. The Supabase client is mocked so the real
 * query-building code runs without a live database. The payload shapes
 * asserted here are the saved_<app>_projects convention contract; the DCA
 * delegation spec at the bottom locks dcaDataPersistence to the same shape
 * against saved_dca_projects (the factory was extracted from it verbatim).
 */

const mockGetUser = jest.fn();
const mockUpsert = jest.fn(() => Promise.resolve({ error: null }));
const mockOrder = jest.fn();
const mockMaybeSingle = jest.fn();
const mockDeleteEq = jest.fn(() => Promise.resolve({ error: null }));
const mockFrom = jest.fn(() => ({
  upsert: (...args) => mockUpsert(...args),
  select: (cols) => ({
    order: (...args) => mockOrder(cols, ...args),
    eq: () => ({ maybeSingle: () => mockMaybeSingle() }),
  }),
  delete: () => ({ eq: (...args) => mockDeleteEq(...args) }),
}));

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    auth: { getUser: (...args) => mockGetUser(...args) },
  },
}));

// eslint-disable-next-line import/first
import { createSavedProjectsService } from '@/utils/savedProjects';
// eslint-disable-next-line import/first
import { listProjects as dcaList, saveProject as dcaSave } from '@/utils/declineCurve/dcaDataPersistence';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockOrder.mockResolvedValue({ data: [], error: null });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
});

const svc = createSavedProjectsService('saved_test_projects', { signInMessage: 'Sign in first.' });

describe('save', () => {
  it('upserts the exact convention payload: id, user_id, project_name, whole payload in inputs_data, ISO updated_at', async () => {
    const payload = { name: 'Flood A', anything: [1, 2, 3] };
    const res = await svc.save('proj-1', payload);
    expect(res).toEqual({ success: true });
    expect(mockFrom).toHaveBeenCalledWith('saved_test_projects');
    const row = mockUpsert.mock.calls[0][0];
    expect(row).toMatchObject({
      id: 'proj-1',
      user_id: 'user-1',
      project_name: 'Flood A',
      inputs_data: payload,
    });
    expect(new Date(row.updated_at).toISOString()).toBe(row.updated_at);
  });

  it("falls back to 'Untitled project' when the payload has no name", async () => {
    await svc.save('proj-2', { notes: 'x' });
    expect(mockUpsert.mock.calls[0][0].project_name).toBe('Untitled project');
  });

  it('throws the configured sign-in message when signed out', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(svc.save('proj-3', { name: 'X' })).rejects.toThrow('Sign in first.');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('propagates upsert errors', async () => {
    mockUpsert.mockResolvedValueOnce({ error: new Error('row level security') });
    await expect(svc.save('proj-4', { name: 'X' })).rejects.toThrow('row level security');
  });
});

describe('list', () => {
  it('selects the index columns ordered by updated_at desc and maps to {id, name, createdAt, updatedAt}', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        { id: 'b', project_name: 'Newer', created_at: 'c2', updated_at: 'u2' },
        { id: 'a', project_name: 'Older', created_at: 'c1', updated_at: 'u1' },
      ],
      error: null,
    });
    const list = await svc.list();
    const [cols, orderCol, orderOpts] = mockOrder.mock.calls[0];
    expect(cols).toBe('id, project_name, created_at, updated_at');
    expect(orderCol).toBe('updated_at');
    expect(orderOpts).toEqual({ ascending: false });
    expect(list).toEqual([
      { id: 'b', name: 'Newer', createdAt: 'c2', updatedAt: 'u2' },
      { id: 'a', name: 'Older', createdAt: 'c1', updatedAt: 'u1' },
    ]);
  });

  it('returns [] when the table is empty (null data)', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    expect(await svc.list()).toEqual([]);
  });
});

describe('load', () => {
  it('returns the inputs_data payload', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { inputs_data: { name: 'Flood A' } }, error: null });
    expect(await svc.load('proj-1')).toEqual({ name: 'Flood A' });
  });

  it('returns null when the project does not exist', async () => {
    expect(await svc.load('missing')).toBeNull();
  });
});

describe('remove', () => {
  it('deletes by id and reports success', async () => {
    const res = await svc.remove('proj-1');
    expect(res).toEqual({ success: true });
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'proj-1');
  });
});

describe('DCA delegation (dcaDataPersistence)', () => {
  it('saveProject hits saved_dca_projects with the identical convention shape', async () => {
    await dcaSave('dca-1', { name: 'Well 7 decline' });
    expect(mockFrom).toHaveBeenCalledWith('saved_dca_projects');
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      id: 'dca-1',
      user_id: 'user-1',
      project_name: 'Well 7 decline',
      inputs_data: { name: 'Well 7 decline' },
    });
  });

  it('listProjects maps rows exactly as before the extraction', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [{ id: 'x', project_name: 'P', created_at: 'c', updated_at: 'u' }],
      error: null,
    });
    expect(await dcaList()).toEqual([{ id: 'x', name: 'P', createdAt: 'c', updatedAt: 'u' }]);
  });

  it('surfaces the DCA-specific sign-in message when signed out', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(dcaSave('dca-2', { name: 'X' })).rejects.toThrow('Sign in to save DCA projects.');
  });
});

// PP0: every row is stamped on write and opened through stateVersion on read.
describe('PP0 state versioning', () => {
  it('stamps schema_version and app_build on save', async () => {
    await svc.save('proj-v', { name: 'V' });
    const row = mockUpsert.mock.calls[0][0];
    expect(row.schema_version).toBe(1);
    expect(row.app_build).toBe('unknown');
  });

  it('retries the save without the stamp when the table lacks the PP0 columns', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUpsert.mockResolvedValueOnce({ error: { code: 'PGRST204', message: "Could not find the 'schema_version' column of 'saved_test_projects' in the schema cache" } });
    const res = await svc.save('proj-w', { name: 'W' });
    expect(res).toEqual({ success: true });
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert.mock.calls[1][0]).not.toHaveProperty('schema_version');
    expect(mockUpsert.mock.calls[1][0]).not.toHaveProperty('app_build');
    warn.mockRestore();
  });

  it('opens a legacy row (no schema_version column) as version 1', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'p', inputs_data: { name: 'legacy' } }, error: null });
    await expect(svc.load('p')).resolves.toEqual({ name: 'legacy' });
  });

  it('refuses a row saved by a newer build, naming both versions', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'p', schema_version: 7, inputs_data: { name: 'future' } }, error: null });
    await expect(svc.load('p')).rejects.toThrow(/state version 7; this build reads up to version 1/);
  });

  it('runs a table-specific migration on load when the service declares a newer shape', async () => {
    const v2 = createSavedProjectsService('saved_v2_projects', {
      schemaVersion: 2,
      migrations: { 1: (row) => ({ ...row, inputs_data: { ...row.inputs_data, units: 'field' } }) },
    });
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'p', schema_version: 1, inputs_data: { name: 'old' } }, error: null });
    await expect(v2.load('p')).resolves.toEqual({ name: 'old', units: 'field' });
    await v2.save('p', { name: 'old', units: 'field' });
    expect(mockUpsert.mock.calls.at(-1)[0].schema_version).toBe(2);
  });
});
