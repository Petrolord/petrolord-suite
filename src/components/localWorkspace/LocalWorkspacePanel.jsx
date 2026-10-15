// Local workspace settings (Seismolord and QI Studio): the folder on this
// computer, the label colleagues see, what is stored here, where new jobs
// run, copy requests from colleagues, and the plain facts about keeping data
// on a laptop (owner decision 5: rely on disk encryption).
import React, { useEffect, useState } from 'react';
import { FolderOpen, HardDrive, ShieldCheck, RefreshCw, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  useLocalWorkspace, setUpWorkspace, reconnectWorkspace, refreshLocalState, localUsage, runOnPreference, setRunOnPreference,
  useBrowserJobs, browserJobs,
} from '@/lib/localWorkspace/runtime';
import { listCopyRequests, setCopyRequestStatus } from '@/lib/localWorkspace/cloud';
import { promoteToCloud } from '@/lib/localWorkspace/promote';
import { assertQuota } from '@/pages/apps/Seismolord/services/seismicStorage';

const gb = (b) => `${(b / 1e9).toFixed(b < 1e10 ? 2 : 0)} GB`;

function CopyRequests({ userId }) {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [busy, setBusy] = useState(null);
  const load = async () => {
    const r = await listCopyRequests(supabase, userId).catch(() => []);
    setRows(r);
    const ids = [...new Set(r.map((x) => x.volume_id))];
    if (ids.length) {
      const { data } = await supabase.from('seismic_volumes').select('id, name, storage_path, user_id').in('id', ids);
      setNames(Object.fromEntries((data || []).map((v) => [v.id, v])));
    }
  };
  useEffect(() => { if (userId) load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const fulfil = async (req) => {
    const row = names[req.volume_id];
    if (!row) return;
    setBusy(req.id);
    try {
      await promoteToCloud({ supabase, row, assertQuota, onProgress: () => {} }).run();
      await setCopyRequestStatus(supabase, req.id, 'fulfilled');
      toast({ title: 'Cloud copy uploaded', description: `${row.name} now opens from the cloud for your colleague.` });
      load();
    } catch (e) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };
  const open = rows.filter((r) => r.status === 'open');
  if (!rows.length) return <p className="text-xs text-pl-muted">No copy requests.</p>;
  return (
    <ul className="space-y-1 text-xs" data-testid="copy-requests">
      {rows.slice(0, 20).map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2">
          <span className="truncate max-w-[16rem]">{names[r.volume_id]?.name || 'A volume'}</span>
          <span className="text-pl-muted">{r.owner_id === userId ? 'asked of you' : 'you asked'}, {r.what === 'full' ? 'full precision' : 'to view'}, {r.status}</span>
          {r.owner_id === userId && r.status === 'open' && (
            <>
              <Button size="xs" variant="outline" disabled={busy === r.id} onClick={() => fulfil(r)}>Upload a cloud copy</Button>
              <Button size="xs" variant="ghost" disabled={busy === r.id} onClick={async () => { await setCopyRequestStatus(supabase, r.id, 'declined'); load(); }}>Decline</Button>
            </>
          )}
          {r.requester_id === userId && r.status === 'open' && (
            <Button size="xs" variant="ghost" onClick={async () => { await setCopyRequestStatus(supabase, r.id, 'cancelled'); load(); }}>Withdraw</Button>
          )}
        </li>
      ))}
      {!open.length ? null : <li className="text-pl-muted">Uploading a copy uses your link and counts against the cloud storage from then on.</li>}
    </ul>
  );
}

export default function LocalWorkspacePanel({ compact = false }) {
  const { toast } = useToast();
  const s = useLocalWorkspace();
  const jobs = useBrowserJobs();
  const [label, setLabel] = useState('');
  const [usage, setUsage] = useState(null);
  const [runOn, setRunOn] = useState(runOnPreference());
  const [busy, setBusy] = useState(false);
  useEffect(() => { localUsage().then(setUsage).catch(() => {}); }, [s.workspace, s.permission]);

  if (!s.loaded) return <p className="text-xs text-pl-muted">Checking this computer...</p>;
  if (!s.schemaReady) {
    return <p className="text-xs text-pl-muted" data-testid="local-ws-off">Keeping seismic on this computer is not switched on for this server yet. Everything stays in the cloud as before.</p>;
  }
  if (!s.support.any) return <p className="text-xs text-pl-warning-text">{s.support.advice}</p>;

  const setUp = async (backend) => {
    setBusy(true);
    try {
      await setUpWorkspace({ backend, label: label.trim() || 'This computer' });
      toast({ title: 'Local workspace ready', description: backend === 'folder' ? 'Seismic you keep on this computer is stored in the folder you chose.' : 'Seismic you keep on this computer is stored in this browser.' });
    } catch (e) {
      if (e?.name !== 'AbortError') toast({ title: 'Could not set up the workspace', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 text-sm" data-testid="local-workspace-panel">
      {!s.workspace ? (
        <div className="space-y-2">
          <p className="text-xs">Keep large seismic on this computer: imports send nothing to Petrolord, and attributes, inversion and the QI steps run here with the same code as our servers. Horizons, wells and every result summary still save to the cloud.</p>
          <label className="block text-xs">
            Name colleagues will see for this computer
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ayo's PC" maxLength={80} className="mt-1 h-8" data-testid="local-ws-label" />
          </label>
          {s.support.folder ? (
            <Button size="sm" onClick={() => setUp('folder')} disabled={busy} data-testid="local-ws-choose-folder">
              <FolderOpen className="w-4 h-4 mr-1" />Choose a folder for local seismic
            </Button>
          ) : (
            <>
              <p className="text-xs text-pl-warning-text">{s.support.advice}</p>
              <Button size="sm" onClick={() => setUp('opfs')} disabled={busy} data-testid="local-ws-use-browser">
                <HardDrive className="w-4 h-4 mr-1" />Use this browser&apos;s storage
              </Button>
            </>
          )}
          <p className="text-[11px] text-pl-muted">Tip: choose a folder on a large drive, for example D:\Petrolord. When the browser asks, choose &quot;Allow on every visit&quot; so it does not ask again.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <HardDrive className="w-4 h-4" />
            <span className="font-medium" data-testid="local-ws-name">{s.workspace.label}</span>
            <span className="text-xs text-pl-muted">{s.workspace.backend === 'folder' ? `folder ${s.workspace.handle?.name || ''}` : "this browser's storage"}</span>
            <Button size="xs" variant="ghost" onClick={() => refreshLocalState({ force: true })} title="Check again"><RefreshCw className="w-3 h-3" /></Button>
          </div>
          {s.permission !== 'granted' && (
            <div className="rounded border border-pl-warning p-2 text-xs space-y-1" data-testid="local-ws-reconnect">
              <p>The browser needs your permission again to use the workspace folder. Choose &quot;Allow on every visit&quot; so it stops asking.</p>
              <Button size="sm" onClick={() => reconnectWorkspace()}>Allow access to the folder</Button>
            </div>
          )}
          {s.workspace.backend === 'opfs' && (
            <p className="text-xs text-pl-warning-text">{'This browser keeps local volumes inside its own storage. Clearing site data deletes them. For large studies use Chrome or Edge with a folder.'}{s.workspace.persisted === false ? ' The browser did not grant persistent storage, so it may remove them when the disk is nearly full.' : ''}</p>
          )}
          {usage && (
            <p className="text-xs" data-testid="local-ws-usage">
              {`${usage.count} volume${usage.count === 1 ? '' : 's'}, ${gb(usage.bytes)} on this computer`}
              {usage.missing ? `, ${usage.missing} missing` : ''}
              {usage.backend === 'opfs' && usage.free != null ? `, ${gb(usage.free)} more fits in this browser` : ''}
            </p>
          )}
          {!compact && (
            <fieldset className="text-xs space-y-1">
              <legend className="flex items-center gap-1 text-pl-muted"><Cpu className="w-3.5 h-3.5" />Where new jobs run</legend>
              <label className="flex items-center gap-2"><input type="radio" checked={runOn === 'auto'} onChange={() => { setRunOnPreference('auto'); setRunOn('auto'); }} />Where the volumes are (this computer for local volumes, our servers for cloud ones)</label>
              <label className="flex items-center gap-2"><input type="radio" checked={runOn === 'browser'} onChange={() => { setRunOnPreference('browser'); setRunOn('browser'); }} data-testid="local-ws-run-here" />Always on this computer (cloud volumes are read and the results saved here)</label>
            </fieldset>
          )}
          {jobs.length > 0 && (
            <ul className="text-xs space-y-0.5" data-testid="local-jobs">
              {jobs.slice(-8).map((j) => (
                <li key={j.id} className="flex items-center gap-2">
                  <span className="truncate max-w-[18rem]">{j.name}</span>
                  <span className="text-pl-muted">{j.phase === 'running' ? `${Math.round((j.fraction || 0) * 100)}%${j.message ? `, ${j.message}` : ''}` : j.phase}</span>
                  {(j.phase === 'running' || j.phase === 'waiting') && <Button size="xs" variant="ghost" onClick={() => browserJobs().cancel(j.id)}>Cancel</Button>}
                </li>
              ))}
              <li className="text-pl-muted">Keep this tab open while jobs run here. The screen stays awake while they do.</li>
            </ul>
          )}
          {!compact && (
            <div className="space-y-1">
              <p className="text-xs font-medium">Copy requests</p>
              <CopyRequests userId={s.userId} />
            </div>
          )}
        </div>
      )}
      <p className="flex gap-1.5 text-[11px] text-pl-muted">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Local volumes are ordinary files on this computer. Petrolord cannot see or recover them. Turn on disk encryption (BitLocker on Windows, FileVault on a Mac) and back the folder up with your own tools.
      </p>
    </div>
  );
}
