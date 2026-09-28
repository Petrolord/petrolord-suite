// PP4 door: back up everything the caller can read as a Petrolord Project
// Package (.pld), beside the organization data export (which stays the
// legal offboarding record). Restore = RestorePanel / PackageImportDialog.

import React, { useEffect, useState } from 'react';
import { Archive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { makeSupabaseSource } from '@/lib/portability/supabaseSource';
import { buildBackup } from '@/lib/portability/backup';
import { savePackageSet } from '@/lib/portability/packageSet';
import { requestSignature } from '@/lib/portability/signClient';
import { supabase } from '@/lib/customSupabaseClient';
import SigningSummary from './SigningSummary';

async function exporterEmail() {
  try { const { data } = await supabase.auth.getUser(); return data?.user?.email || null; } catch (e) { return null; }
}

export default function BackupPanel() {
  const [hasOrg, setHasOrg] = useState(false);
  const [busy, setBusy] = useState(null); // 'mine' | 'org' | null
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const who = await makeSupabaseSource().currentUser();
        if (alive) setHasOrg(!!who.organization_id);
      } catch (e) { /* signed out: buttons still render, the run reports it */ }
    })();
    return () => { alive = false; };
  }, []);

  const run = async (scope) => {
    setBusy(scope);
    setError(null);
    setSummary(null);
    setProgress('Starting');
    try {
      const source = makeSupabaseSource();
      const who = await source.currentUser();
      const b = await buildBackup(source, scope, { who: { userId: who.id }, onProgress: setProgress });
      // PP5: sign before the set is finished (the manifest is written into part 1 then); never blocks
      setProgress('Signing');
      let signing = { signature: null, reason: 'signing service unavailable' };
      try {
        signing = await requestSignature(b.manifest, { exporterEmail: await exporterEmail() });
        if (signing?.signature) b.manifest.signature = signing.signature;
      } catch (e) { signing = { signature: null, reason: e?.message || 'signing service unavailable' }; }
      const res = await savePackageSet(b.set, b.manifest, b.manifest.name, (msg) => setProgress(msg));
      if (res.method === 'cancelled') {
        setProgress('');
        setError({ message: 'Save cancelled.' });
        return;
      }
      setSummary({
        roots: b.roots.length,
        tables: Object.entries(b.manifest.tables || {}).map(([t, i]) => [t, i.rows]),
        blobs: (b.manifest.blobs || []).length,
        parts: b.set.partCount,
        files: res.files,
        notes: b.manifest.notes || [],
        name: b.manifest.name,
        signing,
      });
      setProgress('');
    } catch (e) {
      setProgress('');
      setError({ message: e?.message || String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card data-testid="pld-backup-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Archive className="w-5 h-5 text-pl-primary-text" aria-hidden="true" /> Back up as a Petrolord Project Package
        </CardTitle>
        <CardDescription>
          A .pld package of everything you can read, restorable into any Petrolord account with
          Restore from a package. It does not replace the organization data export above, which is
          the legal offboarding record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="pld-backup-mine"
            disabled={!!busy}
            onClick={() => run('mine')}
          >
            {busy === 'mine' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Back up my work
          </Button>
          <Button
            data-testid="pld-backup-org"
            variant="outline"
            disabled={!!busy || !hasOrg}
            title={hasOrg ? 'Everything shared with your organization, plus your own work' : 'You are not a member of an organization'}
            onClick={() => run('org')}
          >
            {busy === 'org' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Back up what my organization shares
          </Button>
        </div>
        <p className="text-xs text-pl-muted">
          Members&apos; private items are not included; each member backs up their own work.
          {!hasOrg ? ' The organization backup needs an organization membership.' : ''}
        </p>

        {busy && progress ? (
          <div className="text-xs text-pl-info-text" data-testid="pld-backup-progress">{progress}</div>
        ) : null}

        {error ? (
          <div className="rounded border border-pl-danger/40 bg-pl-danger-bg px-3 py-2 text-xs text-pl-danger-text" data-testid="pld-backup-error">
            {error.message}
          </div>
        ) : null}

        {summary ? (
          <div className="rounded border border-pl-border bg-pl-sunken px-3 py-2 text-xs space-y-1.5" data-testid="pld-backup-summary">
            <div className="text-pl-text font-medium">{summary.name}</div>
            <div className="text-pl-muted">
              {summary.roots} item{summary.roots === 1 ? '' : 's'} backed up, {summary.blobs} binary file{summary.blobs === 1 ? '' : 's'}.
              {' '}
              {summary.parts > 1
                ? `Saved as ${summary.parts} part files, keep them together: ${summary.files.join(', ')}.`
                : `Saved as ${summary.files[0] || 'one file'}.`}
            </div>
            <ul className="text-pl-text grid grid-cols-1 sm:grid-cols-2 gap-x-3">
              {summary.tables.map(([t, n]) => (
                <li key={t}><span className="text-pl-muted">{t}</span> {n}</li>
              ))}
            </ul>
            <SigningSummary result={summary.signing} />
            {summary.notes.length ? (
              <div>
                <div className="text-pl-text">Notes</div>
                <ul className="list-disc pl-4 text-pl-muted">
                  {summary.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
