// Handover controls for a worker product (QI programme Q11): SEG-Y of each
// of its volumes from the seismic worker (export_segy; the link lasts 24
// hours and the file 3 days), and the run record of the job that made it.
import React, { useEffect, useRef, useState } from 'react';
import * as qiService from '@/lib/qiService';
import { buildLabel } from '@/lib/platformBuild';
import { useQIStudio } from '../QIStudioContext';
import { runRecord, downloadText } from '../services/handover';

const btn = 'px-1.5 py-0.5 rounded border text-[11px] border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';

/**
 * @param {{volumes: Array<{key: string, label: string, id: string}>, jobId: ?string, name: string}} p
 */
export default function ExportControls({ volumes, jobId, name }) {
  const { jobs, addNotification } = useQIStudio();
  const client = jobs || qiService;
  const [state, setState] = useState({}); // key -> {job} | {error}
  const stops = useRef([]);
  useEffect(() => () => { for (const s of stops.current) s(); }, []);
  const exportOne = async (v) => {
    setState((m) => ({ ...m, [v.key]: { job: { status: 'queued' } } }));
    try {
      const id = await client.enqueueJob('export_segy', { volume_id: v.id, name: `${name} ${v.label} SEG-Y` });
      stops.current.push(client.watchJob(id, (row, err) => setState((m) => ({ ...m, [v.key]: err ? { error: qiService.friendlyError(err) } : { job: row } }))));
    } catch (e) {
      setState((m) => ({ ...m, [v.key]: { error: qiService.friendlyError(e) } }));
    }
  };
  const record = async () => {
    try {
      const job = await (client.getJob || qiService.getJob)(jobId);
      if (!job) throw new Error('The job was not found.');
      downloadText(`${String(name).replace(/[^A-Za-z0-9._-]+/g, '_')}_run_record.json`, JSON.stringify(runRecord(job, { build: buildLabel() }), null, 1), 'application/json');
    } catch (e) {
      addNotification(`The run record could not be written: ${e.message}`, 'error');
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="qi-export-controls">
      {volumes.map((v) => {
        const st = state[v.key];
        const done = st?.job?.status === 'succeeded' && st.job.result_refs?.url;
        return (
          <span key={v.key} className="inline-flex items-center gap-1">
            {done ? (
              <a className="underline text-[11px]" href={st.job.result_refs.url} data-testid={`qi-export-link-${v.key}`}>{`${v.label} SEG-Y (link valid 24 hours)`}</a>
            ) : (
              <button type="button" className={btn} onClick={() => exportOne(v)} disabled={!!st?.job && qiService.isActive(st.job)} data-testid={`qi-export-${v.key}`}>
                {st?.job && qiService.isActive(st.job) ? `${v.label}: ${st.job.status}` : `${v.label} SEG-Y`}
              </button>
            )}
            {st?.error && <span className="text-pl-danger-text text-[11px]">{st.error}</span>}
            {st?.job?.status === 'failed' && <span className="text-pl-danger-text text-[11px]">{st.job.error_message || 'The export failed.'}</span>}
          </span>
        );
      })}
      {jobId && <button type="button" className={btn} onClick={record} data-testid="qi-run-record">Run record</button>}
    </div>
  );
}
