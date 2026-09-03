import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  AlertTriangle, DatabaseBackup, Download, FileArchive, FileJson, Loader2, RefreshCw, Search, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import BackupPanel from '@/components/portability/BackupPanel';
import RestorePanel from '@/components/portability/RestorePanel';

const MAX_LISTED_FILES = 300;

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return 'n/a';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function StatusBadge({ status }) {
  if (status === 'completed') return <Badge className="bg-green-500/20 text-green-400 hover:bg-green-500/30">Completed</Badge>;
  if (status === 'processing') return <Badge className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30">Processing</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/30">Failed</Badge>;
}

export default function DataExport() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [orgId, setOrgId] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [filesJob, setFilesJob] = useState(null);        // job whose manifest is open
  const [manifest, setManifest] = useState(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [signingPath, setSigningPath] = useState(null);
  const [orgName, setOrgName] = useState('');
  const [closure, setClosure] = useState(null);          // scheduled closure request, if any
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [closureBusy, setClosureBusy] = useState(false);
  const pollRef = useRef(null);

  const fetchJobs = useCallback(async (org) => {
    const target = org || orgId;
    if (!target) return [];
    const { data, error } = await supabase
      .from('org_export_jobs')
      .select('*')
      .eq('organization_id', target)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      console.error('Error loading export jobs:', error);
      return [];
    }
    setJobs(data || []);
    return data || [];
  }, [orgId]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const row = await getUserOrgRow(user.id);
        if (row?.organization_id) {
          setOrgId(row.organization_id);
          await Promise.all([
            fetchJobs(row.organization_id),
            fetchClosure(row.organization_id),
            supabase.from('organizations').select('name').eq('id', row.organization_id).maybeSingle()
              .then(({ data }) => setOrgName(data?.name || '')),
          ]);
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Poll while an export is running so the table updates even if the
  // long-lived request call is cut off by a proxy timeout.
  useEffect(() => {
    const hasProcessing = jobs.some((j) => j.status === 'processing');
    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(() => fetchJobs(), 5000);
    } else if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs, fetchJobs]);

  const fetchClosure = async (org) => {
    const { data } = await supabase
      .from('org_closure_requests')
      .select('id, status, effective_at, requested_by_email, created_at')
      .eq('organization_id', org || orgId)
      .eq('status', 'scheduled')
      .maybeSingle();
    setClosure(data || null);
  };

  const requestClosure = async () => {
    setClosureBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('org-offboard', {
        body: { action: 'request', organization_id: orgId, confirm_name: confirmName, reason: closureReason || undefined },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Account closure scheduled',
        description: `All data will be permanently deleted on ${new Date(data.effective_at).toLocaleDateString()}. Any admin can cancel before then.`,
      });
      setCloseDialogOpen(false);
      setConfirmName('');
      setClosureReason('');
      await fetchClosure();
    } catch (e) {
      toast({ title: 'Could not schedule closure', description: e.message, variant: 'destructive' });
    } finally {
      setClosureBusy(false);
    }
  };

  const cancelClosure = async () => {
    if (!closure) return;
    setClosureBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('org-offboard', {
        body: { action: 'cancel', request_id: closure.id },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Closure cancelled', description: 'Your account continues unchanged.' });
      setClosure(null);
    } catch (e) {
      toast({ title: 'Could not cancel', description: e.message, variant: 'destructive' });
    } finally {
      setClosureBusy(false);
    }
  };

  const requestExport = async () => {
    if (!orgId) return;
    setRequesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('org-export', {
        body: { action: 'request', organization_id: orgId },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Export ready',
        description: `${data.total_rows} records across ${data.tables} tables. You will also receive an email confirmation.`,
      });
    } catch (e) {
      // A network cutoff on a long export is not a failure: the job keeps
      // running server-side and the poller below picks up the result.
      if (/Failed to fetch|NetworkError|timeout/i.test(e.message)) {
        toast({
          title: 'Export is running',
          description: 'This can take a few minutes. The list below updates automatically.',
        });
      } else {
        toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
      }
    } finally {
      setRequesting(false);
      fetchJobs();
    }
  };

  const downloadZip = async (job) => {
    try {
      const { data, error } = await supabase.functions.invoke('org-export', {
        body: { action: 'download', job_id: job.id, target: 'zip' },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' });
    }
  };

  const openFiles = async (job) => {
    setFilesJob(job);
    setManifest(null);
    setFileSearch('');
    setManifestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('org-export', {
        body: { action: 'download', job_id: job.id, target: 'manifest' },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      const res = await fetch(data.url);
      if (!res.ok) throw new Error(`manifest fetch failed (${res.status})`);
      setManifest(await res.json());
    } catch (e) {
      toast({ title: 'Could not load file list', description: e.message, variant: 'destructive' });
      setFilesJob(null);
    } finally {
      setManifestLoading(false);
    }
  };

  const downloadBlob = async (entry) => {
    setSigningPath(`${entry.bucket}:${entry.path}`);
    try {
      const { data, error } = await supabase.functions.invoke('org-export', {
        body: {
          action: 'sign_blobs',
          organization_id: orgId,
          paths: [{ bucket: entry.bucket, path: entry.path }],
        },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      const result = (data.results || [])[0];
      if (!result?.url) throw new Error(result?.error || 'No download link returned.');
      window.open(result.url, '_blank', 'noopener');
    } catch (e) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' });
    } finally {
      setSigningPath(null);
    }
  };

  const isExpired = (job) =>
    job.expires_at && new Date(job.expires_at).getTime() < Date.now();

  const storageEntries = manifest?.storage?.entries || [];
  const filteredEntries = storageEntries.filter((e) =>
    e.path.toLowerCase().includes(fileSearch.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <DatabaseBackup className="w-8 h-8 text-lime-400" /> Data Export
          </h1>
          <p className="text-slate-400">
            Download a complete copy of your organization&apos;s data at any time.
          </p>
        </div>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="w-5 h-5 text-lime-400" /> Your data belongs to you
            </CardTitle>
            <CardDescription className="text-slate-400">
              An export contains every database record your organization owns, including
              projects, wells, interpretations and billing history, packaged as JSON files
              in a single zip. Large stored files such as seismic volumes and log curves
              are listed in the export manifest and can be downloaded individually.
              Security credentials and tokens are never included. Exports are available
              for 7 days and only organization admins can request or download them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={requestExport}
              disabled={requesting || !orgId || jobs.some((j) => j.status === 'processing')}
              className="bg-lime-600 hover:bg-lime-700 text-white"
            >
              {requesting || jobs.some((j) => j.status === 'processing') ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Export in progress...</>
              ) : (
                <><FileArchive className="w-4 h-4 mr-2" /> Request Export</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Export history</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => fetchJobs()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-slate-900">
                  <TableHead className="text-slate-400">Requested</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Records</TableHead>
                  <TableHead className="text-slate-400">Stored files</TableHead>
                  <TableHead className="text-slate-400">Expires</TableHead>
                  <TableHead className="text-right text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-slate-500">Loading...</TableCell></TableRow>
                ) : jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-slate-500">
                      No exports yet. Request one above.
                    </TableCell>
                  </TableRow>
                ) : (
                  jobs.map((job) => (
                    <TableRow key={job.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-sm text-slate-300">
                        {new Date(job.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={job.status} />
                        {job.status === 'failed' && job.error_message && (
                          <div className="text-xs text-slate-500 mt-1 max-w-xs truncate" title={job.error_message}>
                            {job.error_message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">
                        {job.total_rows != null ? job.total_rows.toLocaleString() : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">
                        {job.blob_count != null ? `${job.blob_count} (${formatBytes(job.blob_bytes)})` : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">
                        {job.expires_at
                          ? (isExpired(job) ? 'Expired' : new Date(job.expires_at).toLocaleDateString())
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {job.status === 'completed' && !isExpired(job) && job.file_path && (
                          <>
                            <Button size="sm" variant="outline" className="border-slate-700 text-slate-200 hover:bg-slate-800" onClick={() => downloadZip(job)}>
                              <Download className="w-4 h-4 mr-1" /> Zip
                            </Button>
                            {job.blob_count > 0 && (
                              <Button size="sm" variant="outline" className="border-slate-700 text-slate-200 hover:bg-slate-800" onClick={() => openFiles(job)}>
                                <FileJson className="w-4 h-4 mr-1" /> Stored files
                              </Button>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <BackupPanel />
        <RestorePanel />

        <Card className="bg-slate-900 border-red-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-red-400">
              <AlertTriangle className="w-5 h-5" /> Close organization account
            </CardTitle>
            <CardDescription className="text-slate-400">
              Closing the account schedules the permanent deletion of every database record,
              every stored file and every member account that belongs only to this organization.
              There is a 30 day grace period during which everything keeps working and any admin
              can cancel. Download a data export before the deletion date; it cannot be recovered afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {closure ? (
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="text-sm">
                  <div className="text-red-300 font-semibold">
                    Deletion scheduled for {new Date(closure.effective_at).toLocaleDateString()}
                  </div>
                  <div className="text-slate-400">
                    Requested by {closure.requested_by_email} on {new Date(closure.created_at).toLocaleDateString()}.
                  </div>
                </div>
                <Button
                  variant="outline"
                  disabled={closureBusy}
                  onClick={cancelClosure}
                  className="md:ml-auto border-slate-600 text-slate-200 hover:bg-slate-800"
                >
                  {closureBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Cancel scheduled deletion
                </Button>
              </div>
            ) : (
              <Button variant="destructive" onClick={() => setCloseDialogOpen(true)} disabled={!orgId}>
                Close organization account
              </Button>
            )}
          </CardContent>
        </Card>

        <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-red-400">Schedule account closure</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <ul className="list-disc pl-5 text-slate-300 space-y-1">
                <li>Deletion happens 30 days from today. Until then everything keeps working.</li>
                <li>Any organization admin can cancel during those 30 days.</li>
                <li>All projects, wells, interpretations, files and billing history will be permanently removed.</li>
                <li>Member accounts that belong only to this organization will be deleted.</li>
                <li>You will receive written confirmation when deletion completes.</li>
              </ul>
              <p className="text-slate-400">
                We strongly recommend requesting a data export above before the deletion date.
              </p>
              <div>
                <label className="block text-slate-300 mb-1">
                  Type the organization name{orgName ? <> (<span className="font-semibold">{orgName}</span>)</> : ''} to confirm
                </label>
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={orgName || 'Organization name'}
                  className="bg-slate-950 border-slate-700"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Reason (optional)</label>
                <Input
                  value={closureReason}
                  onChange={(e) => setClosureReason(e.target.value)}
                  placeholder="Helps us improve"
                  className="bg-slate-950 border-slate-700"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCloseDialogOpen(false)} className="text-slate-300">
                  Keep account
                </Button>
                <Button
                  variant="destructive"
                  disabled={closureBusy || !confirmName.trim()}
                  onClick={requestClosure}
                >
                  {closureBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Schedule deletion
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!filesJob} onOpenChange={(open) => { if (!open) setFilesJob(null); }}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-3xl">
            <DialogHeader>
              <DialogTitle>Stored files in this export</DialogTitle>
            </DialogHeader>
            {manifestLoading ? (
              <div className="flex items-center justify-center h-32 text-slate-400">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading manifest...
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">
                  Each download link is generated on demand and is valid for one hour.
                </p>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Filter files..."
                    className="pl-8 bg-slate-950 border-slate-700"
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-80 overflow-y-auto border border-slate-800 rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800">
                        <TableHead className="text-slate-400">File</TableHead>
                        <TableHead className="text-slate-400">Size</TableHead>
                        <TableHead className="text-right text-slate-400" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center h-16 text-slate-500">No files.</TableCell>
                        </TableRow>
                      ) : (
                        filteredEntries.slice(0, MAX_LISTED_FILES).map((entry) => (
                          <TableRow key={`${entry.bucket}:${entry.path}`} className="border-slate-800">
                            <TableCell className="text-xs text-slate-300 font-mono break-all">
                              {entry.bucket}/{entry.path}
                            </TableCell>
                            <TableCell className="text-xs text-slate-400 whitespace-nowrap">
                              {formatBytes(entry.size)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 text-slate-300 hover:text-white"
                                disabled={signingPath === `${entry.bucket}:${entry.path}`}
                                onClick={() => downloadBlob(entry)}
                              >
                                {signingPath === `${entry.bucket}:${entry.path}`
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <Download className="w-4 h-4" />}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filteredEntries.length > MAX_LISTED_FILES && (
                  <p className="text-xs text-slate-500">
                    Showing the first {MAX_LISTED_FILES} of {filteredEntries.length} files.
                    Use the filter to narrow the list. The full inventory is in manifest.json inside the zip.
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
