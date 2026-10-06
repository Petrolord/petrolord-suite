/**
 * @jest-environment node
 */
// Server attribute volumes (QI programme Q0b), browser side: when the
// dialog offers and prefers the server, register-then-enqueue ordering, the
// row taken back out when no job can fill it, and the Jobs dock view.
import { serverAttributeAdvice, startServerAttribute, SERVER_ATTRIBUTE_SUGGEST_BYTES } from '../services/serverAttribute';
import { jobView, volumesChanged } from '../lib/serverJobsView';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../services/attributeJobService', () => ({ registerAttributeVolume: jest.fn() }));
jest.mock('../services/volumesService', () => ({ deleteVolume: jest.fn() }));

const manifestOfBytes = (bytes) => ({ brick: { size: 64, count: Math.ceil(bytes / (64 ** 3 * 4)) } });

describe('serverAttributeAdvice', () => {
  test('offered for your own volume; preferred from 1 GiB of output', () => {
    expect(serverAttributeAdvice({ parentManifest: manifestOfBytes(SERVER_ATTRIBUTE_SUGGEST_BYTES), isOwnVolume: true })).toEqual({ offer: true, preferred: true });
    expect(serverAttributeAdvice({ parentManifest: manifestOfBytes(100 * 1024 ** 2), isOwnVolume: true })).toEqual({ offer: true, preferred: false });
  });
  test("not offered for a colleague's shared volume, or without a manifest", () => {
    expect(serverAttributeAdvice({ parentManifest: manifestOfBytes(5 * 1024 ** 3), isOwnVolume: false }).offer).toBe(false);
    expect(serverAttributeAdvice({ parentManifest: null, isOwnVolume: true }).offer).toBe(false);
  });
});

describe('startServerAttribute', () => {
  const parent = { id: 'p1', name: 'Dome' };
  const attribute = { name: 'envelope', params: {} };
  test('registers the row as the browser route does, then enqueues the job with what the worker needs', async () => {
    const order = [];
    const deps = {
      register: jest.fn(async () => { order.push('register'); return { row: { id: 'v1', name: 'Dome [Envelope]' }, volumeId: 'v1' }; }),
      enqueue: jest.fn(async () => { order.push('enqueue'); return 'job-1'; }),
      remove: jest.fn(),
    };
    expect(await startServerAttribute({ parent, parentManifest: {}, attribute }, deps)).toEqual({ jobId: 'job-1', volumeId: 'v1' });
    expect(order).toEqual(['register', 'enqueue']);
    expect(deps.enqueue).toHaveBeenCalledWith('attribute_volume', { volume_id: 'v1', parent_volume_id: 'p1', name: 'Dome [Envelope]', attribute: { name: 'envelope', params: {} } });
    expect(deps.remove).not.toHaveBeenCalled();
  });
  test('when the job cannot be queued, the registered row is removed again', async () => {
    const row = { id: 'v1' };
    const deps = { register: async () => ({ row, volumeId: 'v1' }), enqueue: async () => { throw new Error('4 jobs already'); }, remove: jest.fn() };
    await expect(startServerAttribute({ parent, parentManifest: {}, attribute }, deps)).rejects.toThrow('4 jobs already');
    expect(deps.remove).toHaveBeenCalledWith(row);
  });
});

describe('Jobs dock view of an attribute job', () => {
  const job = (over) => ({ id: 'a1', kind: 'attribute_volume', status: 'running', progress: 0.3, progress_message: 'Computing', params: { name: 'Dome [Envelope]', volume_id: 'v1' }, ...over });
  test('titled by the volume name; openable only when done', () => {
    expect(jobView(job())).toMatchObject({ title: 'Dome [Envelope]', kind: 'Attribute volume', canOpen: false, volumeId: 'v1' });
    expect(jobView(job({ status: 'succeeded', result_refs: { volume_id: 'v1', bricks: 12 } }))).toMatchObject({ canOpen: true, detail: '12 bricks computed' });
  });
  test('finishing triggers a volume re-list once', () => {
    const before = [job()];
    const after = [job({ status: 'succeeded', result_refs: { volume_id: 'v1', bricks: 12 } })];
    expect(volumesChanged(before, after)).toBe(true);
    expect(volumesChanged(after, after)).toBe(false);
  });
});
