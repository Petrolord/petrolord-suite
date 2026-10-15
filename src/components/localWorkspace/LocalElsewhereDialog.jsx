// A volume that lives on someone else's computer (docs/scope/LocalWorkspace-DESIGN.md
// section 5.4): what a colleague in the same Suite Project sees instead of
// the seismic. The record, horizons and faults are here; the previews show
// what it looks like (unless the project keeps previews off); the seismic
// stays on that computer. They can ask the owner for a cloud copy. There is
// no streaming from a colleague's machine (owner decision 6).
import React, { useEffect, useState } from 'react';
import { Laptop, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { requestCloudCopy } from '@/lib/localWorkspace/cloud';
import { PREVIEW_NAMES } from '@/lib/localWorkspace/previews';

export default function LocalElsewhereDialog({ open, onOpenChange, volume, placement }) {
  const { toast } = useToast();
  const [urls, setUrls] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let live = true;
    setSent(false);
    if (!open || !volume?.storage_path) { setUrls([]); return undefined; }
    (async () => {
      const out = [];
      for (const n of PREVIEW_NAMES) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await supabase.storage.from('seismic').createSignedUrl(`${volume.storage_path}/previews/${n}.png`, 600);
        if (data?.signedUrl) out.push({ n, url: data.signedUrl });
      }
      if (live) setUrls(out);
    })().catch(() => {});
    return () => { live = false; };
  }, [open, volume?.storage_path]);

  const ask = async (what) => {
    setBusy(true);
    try {
      await requestCloudCopy(supabase, { volumeId: volume.id, ownerId: volume.user_id, what });
      setSent(true);
      toast({ title: 'Request sent', description: `${placement?.deviceLabel || 'The owner'} will see it in Local workspace, Copy requests.` });
    } catch (e) {
      toast({ title: 'Could not send the request', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const labels = { inline: 'Inline', xline: 'Crossline', time: 'Time slice' };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="local-elsewhere-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Laptop className="w-4 h-4" />{volume?.name}</DialogTitle>
          <DialogDescription>{placement?.title}</DialogDescription>
        </DialogHeader>
        {urls.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {urls.map((u) => (
              <figure key={u.n} className="text-[11px] text-pl-muted">
                <img src={u.url} alt={`${labels[u.n]} preview`} className="w-full rounded border border-pl-border bg-white" />
                <figcaption>{labels[u.n]} (preview)</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="text-xs text-pl-muted">No preview was shared for this volume (members-only projects keep previews on the owner&apos;s computer unless the owner turns them on).</p>
        )}
        {placement?.canRequestCopy && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" disabled={busy || sent} onClick={() => ask('display')} data-testid="request-copy-display">
              <Send className="w-3.5 h-3.5 mr-1" />Ask for a cloud copy to view
            </Button>
            <Button size="sm" variant="outline" disabled={busy || sent} onClick={() => ask('full')}>
              Ask for the full-precision copy
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
