// The storage client the two-stage upload (services/uploadV4.js) talks
// to, over supabase-js Storage. Kept apart from uploadV4 so the state
// machine never imports the Supabase client (jest drives it with a mock).
//
//   upload(path, bytes, {contentType, upsert}) -> 'uploaded' | 'exists'
//     throws an Error carrying .status (HTTP status, or none for a
//     network failure, which the upload treats as a dropped connection)
//   list(dirPath) -> object names directly under dirPath (paginated)

const PAGE = 1000;

function storageError(error, path) {
  const e = new Error(`Upload failed for ${path}: ${error?.message || 'unknown error'}`);
  const status = Number(error?.statusCode ?? error?.status);
  if (Number.isFinite(status)) e.status = status;
  return e;
}

const exists = (error) => /already exists|duplicate/i.test(error?.message || '')
  || String(error?.statusCode) === '409';

/**
 * @param {Object} supabase the supabase-js client
 * @param {string} bucket
 */
export function supabaseStorageClient(supabase, bucket) {
  const store = () => supabase.storage.from(bucket);
  return {
    async upload(path, bytes, { contentType = 'application/octet-stream', upsert = false } = {}) {
      const body = new Blob([bytes], { type: contentType });
      let res;
      try {
        res = await store().upload(path, body, { contentType, upsert });
      } catch (err) {
        throw storageError(err, path);          // fetch threw: no status
      }
      if (!res.error) return 'uploaded';
      if (exists(res.error)) {
        if (!upsert) return 'exists';
        // the manifest is rewritten when each stage completes
        const upd = await store().update(path, body, { contentType });
        if (!upd.error) return 'uploaded';
        throw storageError(upd.error, path);
      }
      throw storageError(res.error, path);
    },
    async list(dirPath) {
      const names = [];
      for (let offset = 0; ; offset += PAGE) {
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await store().list(dirPath, { limit: PAGE, offset });
        if (error) throw storageError(error, dirPath);
        (data || []).forEach((o) => names.push(o.name));
        if (!data || data.length < PAGE) break;
      }
      return names;
    },
  };
}
