// scan_dataset: the import dialog's preview scan, run on a file already in
// the worker's store (QI programme Q0b-3; "import from a link" has no local
// file to scan). The same steps as the browser's scan worker
// (workers/ingest.worker.js handleScan): the SEG-Y door, the textual header,
// the first trace headers under the mapping, the sampled geometry scan
// (20,000 traces), and the door's warnings and depth hint.
//
// params: { dataset_id, mapping }
import { JobFailure } from '../runJob.js';
import { s3RangeReader } from '../s3.js';
import { openSegyDoor, doorScanWarnings, depthDomainHint } from '../../../../src/pages/apps/Seismolord/lib/segyDoor.js';
import { readTextualHeader, previewTraceHeaders, scanGeometry } from '../../../../packages/engines/engines/seismolord/segyScan.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function scanDataset(ctx, deps) {
  const p = ctx.params || {};
  if (!UUID.test(String(p.dataset_id))) throw new JobFailure('validate_failed', 'dataset_id is required.');
  const mapping = p.mapping && typeof p.mapping === 'object' ? p.mapping : {};
  const uid = ctx.job.user_id;
  const { data: ds, error } = await deps.admin.from('qi_datasets').select('*').eq('id', p.dataset_id).maybeSingle();
  if (error) throw new Error(`Could not read the file record: ${error.message}`);
  if (!ds || ds.user_id !== uid) throw new JobFailure('not_found', 'The file was not found in your account.');
  if (ds.status !== 'uploaded') throw new JobFailure('validate_failed', `The file is ${ds.status}, not ready to scan.`);

  ctx.progress(0.05, 'Reading headers');
  const raw = deps.makeReader
    ? deps.makeReader(ds)
    : s3RangeReader({ sign: deps.sign, bucket: ds.bucket, key: ds.object_key, size: Number(ds.bytes), fetchImpl: deps.fetchImpl });
  let door; let reader;
  try {
    ({ door, reader } = await openSegyDoor(raw));
  } catch (e) {
    throw new JobFailure('not_segy', e.message);
  }
  const textLines = await readTextualHeader(reader);
  const preview = await previewTraceHeaders(reader, mapping);
  const scan = await scanGeometry(reader, mapping, {
    maxTraces: 20000,
    onProgress: (done, total) => ctx.progress(0.1 + 0.85 * (total ? done / total : 0), 'Scanning trace headers'),
  });
  scan.warnings = doorScanWarnings(door, scan);
  scan.door = {
    revision: door.revision, extTextHeaders: door.extTextHeaders, coordUnits: door.coordUnits,
    zeroCoordinates: door.zeroCoordinates, patches: door.patches,
  };
  scan.depthHint = depthDomainHint(textLines);
  return { dataset_id: ds.id, scan, textLines, preview };
}
