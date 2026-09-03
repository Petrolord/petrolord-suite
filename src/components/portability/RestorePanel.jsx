// PP4 door: restore from a Petrolord Project Package on the Data Export page.

import React, { useState } from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PackageImportDialog from '@/components/portability/PackageImportDialog';

export default function RestorePanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  return (
    <Card className="bg-slate-900 border-slate-800" data-testid="pld-restore-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PackageOpen className="w-5 h-5 text-cyan-400" /> Restore from a package
        </CardTitle>
        <CardDescription className="text-slate-400">
          A restore creates new copies under your account, private unless you choose to share
          them with your organization. Nothing you already have is changed. Multi-part backups
          need all their part files chosen together.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button data-testid="pld-restore-open" onClick={() => setOpen(true)} className="bg-cyan-600 hover:bg-cyan-500 text-white">
          Restore from a package
        </Button>
        {status ? <div className="text-xs text-slate-400" data-testid="pld-restore-status">{status}</div> : null}
        <PackageImportDialog
          open={open}
          onOpenChange={setOpen}
          onImported={(s) => setStatus(`Restored ${s.rowsWritten} rows and ${s.blobsWritten} files.`)}
          onStatus={setStatus}
        />
      </CardContent>
    </Card>
  );
}
