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
    <Card data-testid="pld-restore-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PackageOpen className="w-5 h-5 text-pl-primary-text" aria-hidden="true" /> Restore from a package
        </CardTitle>
        <CardDescription>
          A restore creates new copies under your account, private unless you choose to share
          them with your organization. Nothing you already have is changed. Multi-part backups
          need all their part files chosen together.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button data-testid="pld-restore-open" onClick={() => setOpen(true)}>
          Restore from a package
        </Button>
        {status ? <div className="text-xs text-pl-muted" data-testid="pld-restore-status">{status}</div> : null}
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
