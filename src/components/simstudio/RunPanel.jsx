// Runs tab: queue a run (RPC quota errors surface verbatim), run history
// with honest status + failure stage, cancel, and the PRT/log excerpt
// viewer. No fake progress — status is whatever the worker last wrote.
import React from 'react';
import { Play, XCircle, FileText, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { fmtElapsed } from '@/components/simstudio/resultAdapters';

const STATUS_TONE = {
  queued: 'text-sky-400 bg-sky-500/10 border-sky-500/40',
  running: 'text-amber-300 bg-amber-500/10 border-amber-500/40',
  complete: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  failed: 'text-red-400 bg-red-500/10 border-red-500/40',
  cancelled: 'text-slate-400 bg-slate-700/20 border-slate-600/40',
};

const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[status] || STATUS_TONE.cancelled}`}>
    {(status === 'queued' || status === 'running') && <Loader2 className="w-3 h-3 animate-spin" />}
    {status}
  </span>
);

const RunPanel = () => {
  const {
    activeCase, runs, queueRun, requestCancel, refreshRuns, activeCaseId,
    loadPrt, prtText, prtRunId,
  } = useSimStudio();

  if (!activeCase) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-sm text-slate-500">
          Open a case first — runs belong to a case.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Runs — {activeCase.name}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
              onClick={() => refreshRuns(activeCaseId)}>
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            <Button size="sm" className="h-7 text-xs bg-lime-600 hover:bg-lime-700"
              disabled={!activeCase.deck_path} onClick={queueRun}
              title={activeCase.deck_path ? 'Queue this deck on the simulation worker' : 'Upload a deck first'}
              data-testid="queue-run">
              <Play className="w-3 h-3 mr-1" /> Run simulation
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No runs yet. Queue one — the worker polls every ~10 seconds.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-800/60">
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-300">Queued</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Elapsed</TableHead>
                  <TableHead className="text-slate-300">Steps</TableHead>
                  <TableHead className="text-slate-300">Failure</TableHead>
                  <TableHead className="text-slate-300 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} className="border-slate-800/60">
                    <TableCell className="text-xs text-slate-400">{new Date(r.queued_at).toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-xs font-mono text-slate-300">{fmtElapsed(r.elapsed_seconds)}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-400">{r.report_steps ?? '—'}</TableCell>
                    <TableCell className="text-xs text-slate-400">{r.failure_stage || '—'}</TableCell>
                    <TableCell className="text-right">
                      {(r.status === 'queued' || r.status === 'running') && !r.cancel_requested && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-400"
                          onClick={() => requestCancel(r.id)}>
                          <XCircle className="w-3 h-3 mr-1" /> Cancel
                        </Button>
                      )}
                      {r.log_path && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-slate-300"
                          onClick={() => loadPrt(r)}>
                          <FileText className="w-3 h-3 mr-1" /> Log
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {runs.some((r) => r.status === 'failed' && r.error_message) && (
        <Card className="bg-slate-900 border-red-900/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-red-300">Latest failure</CardTitle></CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-xs text-red-200/90 font-mono max-h-48 overflow-y-auto">
              {runs.find((r) => r.status === 'failed' && r.error_message)?.error_message}
            </pre>
          </CardContent>
        </Card>
      )}

      {prtText != null && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Simulator log excerpt {prtRunId ? `(run ${prtRunId.slice(0, 8)})` : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-[11px] text-slate-400 font-mono max-h-72 overflow-y-auto" data-testid="prt-viewer">
              {prtText || '(empty)'}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RunPanel;
