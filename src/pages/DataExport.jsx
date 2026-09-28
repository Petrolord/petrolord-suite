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
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

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
  if (status === 'completed') return <Badge variant="success">Completed</Badge>;
  if (status === 'processing') return <Badge variant="info">Processing</Badge>;
  return <Badge variant="danger">Failed</Badge>;
}

function DataExportPage() {
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
    <AccountPage>

        <AccountHeader
          eyebrow="Organization"
          icon={DatabaseBackup}
          title="Data Export"
          description={<>Download a complete copy of your organization&apos;s data at any time.</>}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="w-5 h-5 text-pl-primary-text" aria-hidden="true" /> Your data belongs to you
            </CardTitle>
            <CardDescription>
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
            >
              {requesting || jobs.some((j) => j.status === 'processing') ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Export in progress...</>
              ) : (
                <><FileArchive className="w-4 h-4 mr-2" /> Request Export</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Export history</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-text" onClick={() => fetchJobs()} aria-label="Refresh export history">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Stored files</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-pl-muted">Loading...</TableCell></TableRow>
                ) : jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-pl-muted">
                      No exports yet. Request one above.
                    </TableCell>
                  </TableRow>
                ) : (
                  jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="text-sm text-pl-text whitespace-nowrap">
                        {new Date(job.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={job.status} />
                        {job.status === 'failed' && job.error_message && (
                          <div className="text-xs text-pl-muted mt-1 max-w-xs truncate" title={job.error_message}>
                            {job.error_message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-pl-text font-pl-mono tabular-nums">
                        {job.total_rows != null ? job.total_rows.toLocaleString() : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-pl-text font-pl-mono tabular-nums whitespace-nowrap">
                        {job.blob_count != null ? `${job.blob_count} (${formatBytes(job.blob_bytes)})` : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-pl-muted whitespace-nowrap">
                        {job.expires_at
                          ? (isExpired(job) ? 'Expired' : new Date(job.expires_at).toLocaleDateString())
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        {job.status === 'completed' && !isExpired(job) && job.file_path && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => downloadZip(job)}>
                              <Download className="w-4 h-4 mr-1" /> Zip
                            </Button>
                            {job.blob_count > 0 && (
                              <Button size="sm" variant="outline" onClick={() => openFiles(job)}>
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

        <Card className="border-pl-danger/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-pl-danger-text">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" /> Close organization account
            </CardTitle>
            <CardDescription>
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
                  <div className="text-pl-danger-text font-semibold">
                    Deletion scheduled for {new Date(closure.effective_at).toLocaleDateString()}
                  </div>
                  <div className="text-pl-muted">
                    Requested by {closure.requested_by_email} on {new Date(closure.created_at).toLocaleDateString()}.
                  </div>
                </div>
                <Button
                  variant="outline"
                  disabled={closureBusy}
                  onClick={cancelClosure}
                  className="md:ml-auto"
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-pl-danger-text">Schedule account closure</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm text-pl-text">
              <ul className="list-disc pl-5 text-pl-text space-y-1">
                <li>Deletion happens 30 days from today. Until then everything keeps working.</li>
                <li>Any organization admin can cancel during those 30 days.</li>
                <li>All projects, wells, interpretations, files and billing history will be permanently removed.</li>
                <li>Member accounts that belong only to this organization will be deleted.</li>
                <li>You will receive written confirmation when deletion completes.</li>
              </ul>
              <p className="text-pl-muted">
                We strongly recommend requesting a data export above before the deletion date.
              </p>
              <div>
                <label className="block text-pl-text mb-1">
                  Type the organization name{orgName ? <> (<span className="font-semibold">{orgName}</span>)</> : ''} to confirm
                </label>
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={orgName || 'Organization name'}                />
              </div>
              <div>
                <label className="block text-pl-text mb-1">Reason (optional)</label>
                <Input
                  value={closureReason}
                  onChange={(e) => setClosureReason(e.target.value)}
                  placeholder="Helps us improve"                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCloseDialogOpen(false)}>
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
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Stored files in this export</DialogTitle>
            </DialogHeader>
            {manifestLoading ? (
              <div className="flex items-center justify-center h-32 text-pl-muted">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading manifest...
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-pl-muted">
                  Each download link is generated on demand and is valid for one hour.
                </p>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" aria-hidden="true" />
                  <Input
                    placeholder="Filter files..."
                    className="pl-8"
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-80 overflow-y-auto border border-pl-border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center h-16 text-pl-muted">No files.</TableCell>
                        </TableRow>
                      ) : (
                        filteredEntries.slice(0, MAX_LISTED_FILES).map((entry) => (
                          <TableRow key={`${entry.bucket}:${entry.path}`}>
                            <TableCell className="text-xs text-pl-text font-pl-mono break-all">
                              {entry.bucket}/{entry.path}
                            </TableCell>
                            <TableCell className="text-xs text-pl-muted font-pl-mono tabular-nums whitespace-nowrap">
                              {formatBytes(entry.size)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 text-pl-muted hover:text-pl-text"
                                aria-label={`Download ${entry.path}`}
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
                  <p className="text-xs text-pl-muted">
                    Showing the first {MAX_LISTED_FILES} of {filteredEntries.length} files.
                    Use the filter to narrow the list. The full inventory is in manifest.json inside the zip.
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

    </AccountPage>
  );
}

export default function DataExport() {
  return (
    <AccountScope testId="data-export-theme-scope">
      <DataExportPage />
    </AccountScope>
  );
}
