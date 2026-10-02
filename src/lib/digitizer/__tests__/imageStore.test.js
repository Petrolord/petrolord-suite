/** @jest-environment node */
// MAP-U2-020: the Digitizer's map image kept with the project. The storage
// fake mirrors the digitizer-images bucket as migration 20261002091000 makes
// it: private, 25 MB, PNG / JPEG / WebP, and every read and write limited to
// the caller's own first folder (the four storage.objects policies, proven
// against Postgres by tools/validation/digitizer-images).
import {
  checkDigitizerImage, sniffImageType, digitizerImagePath, makeDigitizerImageStore, makeFakeDigitizerStorage,
  DIGITIZER_BUCKET, DIGITIZER_IMAGE_MAX_BYTES,
} from '../imageStore';
import { makeInMemoryDigitizerBackend } from '../digitizerBackend';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { storage: { from: () => ({}) }, auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) } }));
jest.mock('@/lib/surfacesRegistry', () => ({ saveSurface: async () => ({}) }));

const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52);
const JPG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1);
const WEBP = Uint8Array.of(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20);
const file = (bytes, name, type = '') => { const b = new Blob([bytes], { type }); b.name = name; return b; };
const png = (name = 'map.png') => file(PNG, name, 'image/png');
const jpg = (name = 'map.jpg') => file(JPG, name, 'image/jpeg');

describe('what the door accepts', () => {
  test('PNG, JPEG and WebP by their content', async () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPG)).toBe('image/jpeg');
    expect(sniffImageType(WEBP)).toBe('image/webp');
    expect(await checkDigitizerImage(png())).toEqual({ ok: true, type: 'image/png', ext: 'png', size: PNG.length });
    expect((await checkDigitizerImage(jpg())).ext).toBe('jpg');
    expect((await checkDigitizerImage(file(WEBP, 'scan.webp', 'image/webp'))).ext).toBe('webp');
    // the content decides, whatever the name or the declared type
    expect((await checkDigitizerImage(file(JPG, 'really-a-jpeg.png', 'image/png'))).type).toBe('image/jpeg');
  });
  test('wrong type: a text file named .png, a PDF, a TIFF', async () => {
    const txt = await checkDigitizerImage(file(new TextEncoder().encode('well,x,y\nA,1,2\n'), 'contours.png', 'image/png'));
    expect(txt).toEqual({ ok: false, reason: '"contours.png" is not a PNG, JPEG or WebP image (its content says otherwise, whatever its name). Choose a PNG, JPEG or WebP scan.' });
    const pdf = await checkDigitizerImage(file(new TextEncoder().encode('%PDF-1.7 ...'), 'map.pdf', 'application/pdf'));
    expect(pdf.ok).toBe(false);
    const tiff = await checkDigitizerImage(file(Uint8Array.of(0x49, 0x49, 0x2a, 0, 8, 0, 0, 0), 'scan.tif', 'image/tiff'));
    expect(tiff.reason).toBe('"scan.tif" is a TIFF, which a browser cannot draw on the digitizing canvas. Convert it to PNG or JPEG.');
  });
  test('zero bytes', async () => {
    expect(await checkDigitizerImage(file(new Uint8Array(0), 'empty.png', 'image/png'))).toEqual({ ok: false, reason: '"empty.png" is empty (0 bytes). Choose the scanned map image again.' });
  });
  test('too large: one byte over 25 MB is refused, exactly 25 MB is accepted', async () => {
    const sized = (size) => ({ name: 'big.png', type: 'image/png', size, slice: () => new Blob([PNG]) });
    const over = await checkDigitizerImage(sized(DIGITIZER_IMAGE_MAX_BYTES + 1));
    expect(over.ok).toBe(false);
    expect(over.reason).toBe('"big.png" is 25.0 MB; the limit for a map image is 25.0 MB. Save the scan at a lower resolution or as a JPEG.');
    expect((await checkDigitizerImage(sized(DIGITIZER_IMAGE_MAX_BYTES))).ok).toBe(true);
    expect((await checkDigitizerImage({ ...sized(40 * 1024 * 1024) })).reason).toMatch(/is 40\.0 MB/);
  });
  test('the path is the owner, the project, one object', () => {
    expect(digitizerImagePath('uid-a', 'proj-1', 'png')).toBe('uid-a/proj-1/map.png');
    expect(() => digitizerImagePath(null, 'proj-1', 'png')).toThrow(/needs its owner/);
  });
});

describe('the storage fake mirrors the bucket policies', () => {
  const storage = makeFakeDigitizerStorage({ userId: 'user-a' });
  const b = () => storage.from(DIGITIZER_BUCKET);
  test('the owner writes and reads under their own folder only', async () => {
    expect((await b().upload('user-a/p1/map.png', png(), { contentType: 'image/png' })).error).toBeNull();
    expect((await b().upload('user-b/p9/map.png', png(), { contentType: 'image/png' })).error.message).toMatch(/row-level security/);
    expect((await b().upload('map.png', png(), { contentType: 'image/png' })).error.message).toMatch(/row-level security/);
    expect((await b().createSignedUrl('user-a/p1/map.png', 600)).data.signedUrl).toMatch(/^fake-signed:\/\/digitizer-images\/user-a\/p1\/map\.png/);
    expect((await b().list('user-a/p1')).data).toEqual([{ name: 'map.png' }]);
  });
  test('another user reads, lists, changes and deletes nothing', async () => {
    storage.as('user-b');
    expect((await b().createSignedUrl('user-a/p1/map.png', 600)).error.message).toBe('Object not found');
    expect((await b().list('user-a/p1')).data).toEqual([]);
    expect((await b().upload('user-a/p1/map.png', png(), { upsert: true, contentType: 'image/png' })).error.message).toMatch(/row-level security/);
    expect((await b().remove(['user-a/p1/map.png'])).data).toEqual([]);
    expect(storage.paths()).toEqual(['user-a/p1/map.png']);
  });
  test('anon reads and writes nothing', async () => {
    storage.as(null);
    expect((await b().createSignedUrl('user-a/p1/map.png', 600)).error).toBeTruthy();
    expect((await b().list('user-a/p1')).data).toEqual([]);
    expect((await b().upload('user-a/p1/x.png', png(), { contentType: 'image/png' })).error.message).toMatch(/row-level security/);
    expect((await b().remove(['user-a/p1/map.png'])).data).toEqual([]);
    expect(storage.paths()).toEqual(['user-a/p1/map.png']);
    storage.as('user-a');
  });
  test('the bucket limits: images only, 25 MB', async () => {
    expect((await b().upload('user-a/p1/notes.txt', file(new TextEncoder().encode('x'), 'notes.txt', 'text/plain'), { contentType: 'text/plain' })).error.message).toBe('mime type text/plain is not supported');
    expect((await b().upload('user-a/p1/big.png', { size: DIGITIZER_IMAGE_MAX_BYTES + 1, type: 'image/png' }, { contentType: 'image/png' })).error.message).toMatch(/maximum allowed size/);
    expect(storage.paths()).toEqual(['user-a/p1/map.png']);
  });
});

describe('the image store', () => {
  const setup = (opts) => {
    const storage = makeFakeDigitizerStorage({ userId: 'user-a', ...opts });
    const store = makeDigitizerImageStore({ storage, getUserId: async () => 'user-a', fetchBlob: (u) => storage.fetchBlob(u) });
    return { storage, store };
  };
  test('save keeps the image under the owner and the project; load gives it back through a signed URL', async () => {
    const { storage, store } = setup();
    const r = await store.save('proj-1', png('Top A scan.png'), { width: 400, height: 300 });
    expect(r.saved).toBe(true);
    expect(r.image).toMatchObject({ name: 'Top A scan.png', width: 400, height: 300, path: 'user-a/proj-1/map.png', bucket: 'digitizer-images', size: PNG.length, type: 'image/png' });
    expect(storage.paths()).toEqual(['user-a/proj-1/map.png']);
    const back = await store.load(r.image);
    expect(back.ok).toBe(true);
    expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(PNG);
    expect(back.url).toMatch(/^blob:/);
  });
  test('replacing the image replaces the object: same type overwrites, another type removes the old one', async () => {
    const { storage, store } = setup();
    await store.save('proj-1', png());
    const again = await store.save('proj-1', png('rescan.png'));
    expect(again.saved).toBe(true);
    expect(storage.paths()).toEqual(['user-a/proj-1/map.png']);                 // one object, overwritten
    const asJpeg = await store.save('proj-1', jpg('rescan.jpg'));
    expect(asJpeg.image.path).toBe('user-a/proj-1/map.jpg');
    expect(asJpeg.swept).toBe(1);
    expect(storage.paths()).toEqual(['user-a/proj-1/map.jpg']);                 // the PNG is gone
    expect(new Uint8Array(await (await store.load(asJpeg.image)).blob.arrayBuffer())).toEqual(JPG);
    // another project's image is not touched by the sweep
    await store.save('proj-2', png());
    await store.save('proj-1', png());
    expect(storage.paths()).toEqual(['user-a/proj-1/map.png', 'user-a/proj-2/map.png']);
  });
  test('a leftover object in the project folder (an orphan) is swept by the next save', async () => {
    const { storage, store } = setup();
    await storage.from(DIGITIZER_BUCKET).upload('user-a/proj-1/old-scan.png', png(), { contentType: 'image/png' });
    const r = await store.save('proj-1', png());
    expect(r.swept).toBe(1);
    expect(storage.paths()).toEqual(['user-a/proj-1/map.png']);
  });
  test('hostile files are refused before any upload, with the reason', async () => {
    const { storage, store } = setup();
    const up = jest.spyOn(storage.from(DIGITIZER_BUCKET), 'upload');
    expect((await store.save('proj-1', file(new TextEncoder().encode('not an image'), 'x.png', 'image/png'))).reason).toMatch(/is not a PNG, JPEG or WebP image/);
    expect((await store.save('proj-1', file(new Uint8Array(0), 'x.png', 'image/png'))).reason).toMatch(/is empty \(0 bytes\)/);
    expect((await store.save('proj-1', { name: 'x.png', size: DIGITIZER_IMAGE_MAX_BYTES + 1, slice: () => new Blob([PNG]) })).reason).toMatch(/the limit for a map image is 25\.0 MB/);
    expect(up).not.toHaveBeenCalled();
    expect(storage.paths()).toEqual([]);
  });
  test('deleting removes every object of the project, and a later load says the image is gone', async () => {
    const { storage, store } = setup();
    const r = await store.save('proj-1', png());
    await store.save('proj-2', png());
    expect(await store.removeAll('proj-1')).toBe(1);
    expect(storage.paths()).toEqual(['user-a/proj-2/map.png']);
    const back = await store.load(r.image);
    expect(back.ok).toBe(false);
    expect(back.reason).toMatch(/could not be read \(Object not found\)\. It may have been deleted\./);
  });
  test("another user cannot load an image by its path, even with the project's settings in hand", async () => {
    const { storage, store } = setup();
    const r = await store.save('proj-1', png());
    storage.as('user-b');
    const back = await store.load(r.image);
    expect(back.ok).toBe(false);
    expect(back.reason).toMatch(/Object not found/);
  });
  test('before the migration (no bucket): the save says so once, keeps nothing, and stops trying', async () => {
    const { storage, store } = setup({ bucket: false });
    const up = jest.spyOn(storage.from(DIGITIZER_BUCKET), 'upload');
    const first = await store.save('proj-1', png());
    expect(first).toEqual({ saved: false, unavailable: true, reason: 'The map image is not kept with the project on this server yet (image storage is waiting to be switched on). The project is saved; you will be asked for the image when you load it.' });
    expect(store.available()).toBe(false);
    await store.save('proj-1', png());
    expect(up).toHaveBeenCalledTimes(1);
    expect((await store.load({ path: 'user-a/proj-1/map.png' })).unavailable).toBe(true);
    expect(await store.removeAll('proj-1')).toBe(0);
    // after the migration the same code keeps the image
    const later = setup();
    expect((await later.store.save('proj-1', png())).saved).toBe(true);
  });
  test('signed out: nothing is kept', async () => {
    const storage = makeFakeDigitizerStorage({ userId: null });
    const store = makeDigitizerImageStore({ storage, getUserId: async () => null });
    expect((await store.save('proj-1', png())).reason).toBe('Sign in to keep the map image with the project.');
  });
});

describe('the in-memory backend (dev harness)', () => {
  test('deleting a project deletes its image, then the row', async () => {
    const backend = makeInMemoryDigitizerBackend();
    const a = await backend.saveProject({ project_name: 'Dome scan', contours: {}, geo_points: [] });
    const b = await backend.saveProject({ project_name: 'Other', contours: {}, geo_points: [] });
    await backend.images.save(a.id, png());
    await backend.images.save(b.id, png());
    await backend.deleteProject(a.id);
    expect(backend.storage.paths()).toEqual([`user-dev/${b.id}/map.png`]);
    expect((await backend.listProjects()).map((p) => p.project_name)).toEqual(['Other']);
    await expect(backend.deleteProject(a.id)).rejects.toThrow(/already gone/);
  });
  test('with no bucket the backend still saves and deletes projects', async () => {
    const backend = makeInMemoryDigitizerBackend({ imageBucket: false });
    const a = await backend.saveProject({ project_name: 'Dome scan', contours: {}, geo_points: [] });
    expect((await backend.images.save(a.id, png())).unavailable).toBe(true);
    await backend.deleteProject(a.id);
    expect(await backend.listProjects()).toEqual([]);
  });
});
