// The ByteReader a handler reads an uploaded or linked file through: the
// worker's store by ranged GETs (s3RangeReader), or, for a dataset that
// records a link that serves ranges (meta.link, ingest_url since 2026-10-15),
// the link itself (linkReader.js).
import { s3RangeReader } from './s3.js';
import { linkRangeReader } from './linkReader.js';

export const isLinkDataset = (ds) => Boolean(ds?.meta?.link?.url);

export function datasetReader(ds, deps = {}) {
  if (deps.makeReader) return deps.makeReader(ds);
  if (isLinkDataset(ds)) {
    const l = ds.meta.link;
    return linkRangeReader({ url: l.url, size: Number(l.size ?? ds.bytes), version: { etag: l.etag || null, last_modified: l.last_modified || null }, ...(deps.linkGet ? { get: deps.linkGet } : {}), ...(deps.linkReaderOptions || {}) });
  }
  return s3RangeReader({ sign: deps.sign, bucket: ds.bucket, key: ds.object_key, size: Number(ds.bytes), fetchImpl: deps.fetchImpl });
}
