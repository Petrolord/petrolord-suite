// Runs tab: queue a run (RPC quota errors surface verbatim), run history
// with honest status + failure stage, cancel, and the PRT/log excerpt
// viewer. No fake progress — status is whatever the worker last wrote.
import React from 'react';
import { Play, XCircle, FileText, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { fmtElapsed, RUN_STEPS_TITLE } from '@/components/simstudio/resultAdapters';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const STATUS_TONE = {
  queued: 'text-pl-info-text bg-pl-info-bg border-pl-info/40',
  running: 'text-pl-warning-text bg-pl-warning-bg border-pl-warning/40',
  complete: 'text-pl-success-text bg-pl-success-bg border-pl-success/40',
  failed: 'text-pl-danger-text bg-pl-danger-bg border-pl-danger/40',
  cancelled: 'text-pl-muted bg-pl-sunken border-pl-border-strong',
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
    loadPrt, prtText, prtRunId, ownerOnlyReason,
  } = useSimStudio();

  if (!activeCase) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-pl-muted">
          Open a case first: runs belong to a case.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Runs: {activeCase.name}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs text-pl-muted"
              onClick={() => refreshRuns(activeCaseId)}>
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            <Button size="sm" className="h-7 text-xs"
              disabled={!activeCase.deck_path || !!ownerOnlyReason} onClick={queueRun}
              title={ownerOnlyReason || (activeCase.deck_path ? 'Queue this deck on the simulation worker' : 'Upload a deck first')}
              data-testid="queue-run">
              <Play className="w-3 h-3 mr-1" /> Run simulation
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ownerOnlyReason && <p className="px-4 pb-2 text-[11px] text-pl-warning-text" data-testid="runs-owner-only">{ownerOnlyReason}</p>}
          {runs.length === 0 ? (
            <div className="py-8 text-center text-sm text-pl-muted">
              No runs yet. Queue one; the worker polls about every 10 seconds.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Elapsed</TableHead>
                  <TableHead title={RUN_STEPS_TITLE}>Steps</TableHead>
                  <TableHead title="Active grid cells, as the simulator counted them">Cells</TableHead>
                  <TableHead title="The simulator's exit code (0 = it ended normally)">Exit</TableHead>
                  <TableHead>Failure</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-pl-muted">{new Date(r.queued_at).toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-xs font-mono text-pl-text">{fmtElapsed(r.elapsed_seconds)}</TableCell>
                    <TableCell className="text-xs font-mono text-pl-muted">{r.report_steps ?? EMPTY_VALUE}</TableCell>
                    <TableCell className="text-xs font-mono text-pl-muted">{r.active_cells != null ? Number(r.active_cells).toLocaleString('en-US') : EMPTY_VALUE}</TableCell>
                    <TableCell className="text-xs font-mono text-pl-muted" data-testid={`run-exit-${r.id}`}>{r.exit_code ?? EMPTY_VALUE}</TableCell>
                    <TableCell className="text-xs text-pl-muted">{r.failure_stage || EMPTY_VALUE}</TableCell>
                    <TableCell className="text-right">
                      {(r.status === 'queued' || r.status === 'running') && !r.cancel_requested && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-pl-danger-text"
                          onClick={() => requestCancel(r.id)}>
                          <XCircle className="w-3 h-3 mr-1" /> Cancel
                        </Button>
                      )}
                      {r.log_path && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-pl-text"
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
        <Card className="border-pl-danger/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-danger-text">Latest failure</CardTitle></CardHeader>
          <CardContent>
            {(() => {
              const f = runs.find((r) => r.status === 'failed' && r.error_message);
              return (
                <p className="text-[11px] text-pl-muted mb-1" data-testid="sim-failure-meta">
                  Stage {f.failure_stage || EMPTY_VALUE}; exit code {f.exit_code ?? `${EMPTY_VALUE} (not recorded by the worker build that ran it)`}; elapsed {fmtElapsed(f.elapsed_seconds)}.
                </p>
              );
            })()}
            <pre className="whitespace-pre-wrap text-xs text-pl-danger-text font-mono max-h-48 overflow-y-auto">
              {runs.find((r) => r.status === 'failed' && r.error_message)?.error_message}
            </pre>
          </CardContent>
        </Card>
      )}

      {prtText != null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Simulator log excerpt {prtRunId ? `(run ${prtRunId.slice(0, 8)})` : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-[11px] text-pl-muted font-mono max-h-72 overflow-y-auto" data-testid="prt-viewer">
              {prtText || '(empty)'}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RunPanel;
