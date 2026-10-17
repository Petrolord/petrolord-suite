// The leave guard (Guided Journey design 6.4). Leaving an app never silently
// stops or loses work:
//  - work that carries on in the background (uploads, conversions, server
//    jobs): the link works and a toast says where to find it;
//  - work that would stop or be lost: a dialog names it first, with Save and
//    leave when the item can save itself;
//  - closing the tab with such work: the browser asks.
// The app uses BrowserRouter (no data router, so no useBlocker): internal
// links are intercepted in the capture phase. The browser's Back button is
// not intercepted (pending saves flush on unmount; see usePendingSave).

import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { getActivity, leaveVerdict } from '@/lib/activity/activity';

/** The internal path an anchor click goes to, or null when the click is not a plain internal navigation. */
export function internalTarget(e, origin = window.location.origin) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target?.closest?.('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return null;
  let url;
  try { url = new URL(a.getAttribute('href'), window.location.href); } catch { return null; }
  if (url.origin !== origin) return null;
  return url.pathname + url.search + url.hash;
}

export default function LeaveGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pending, setPending] = useState(null);   // {to, block}
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    const onClick = (e) => {
      const to = internalTarget(e);
      if (!to) return;
      const v = leaveVerdict(getActivity(), pathRef.current, to);
      if (!v.leaving) return;
      if (v.block.length) {
        e.preventDefault();
        e.stopPropagation();
        setPending({ to, block: v.block });
        return;
      }
      if (v.carryOn.length) {
        const what = v.carryOn.length === 1 ? v.carryOn[0].title.split(':')[0] : `${v.carryOn.length} jobs`;
        toast({ title: 'Carrying on in the background', description: `${what} from ${v.carryOn[0].appName} carries on. You will find it under Activity.` });
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [toast]);

  useEffect(() => {
    const onUnload = (e) => {
      const blocking = getActivity().some((i) => (i.onLeave === 'loses' || i.onLeave === 'stops') && (i.state === 'running' || i.state === 'dirty'));
      if (!blocking) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const savers = pending?.block.filter((i) => i.actions?.save) || [];
  const go = () => { const to = pending.to; setPending(null); navigate(to); };
  const saveAndGo = async () => {
    for (const i of savers) {
      // eslint-disable-next-line no-await-in-loop
      try { await i.actions.save(); } catch (err) {
        toast({ title: 'Not saved', description: `${i.title}: ${err.message}`, variant: 'destructive' });
        return;
      }
    }
    go();
  };

  return (
    <AlertDialog open={Boolean(pending)} onOpenChange={(o) => { if (!o) setPending(null); }}>
      <AlertDialogContent data-testid="leave-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this app?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <p>Leaving now {pending?.block.some((i) => i.onLeave === 'loses') ? 'loses' : 'stops'}:</p>
              <ul className="mt-2 list-disc pl-5">
                {pending?.block.map((i) => <li key={i.id}>{i.title}</li>)}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="leave-stay">Stay</AlertDialogCancel>
          {savers.length > 0 && (
            <AlertDialogAction onClick={(e) => { e.preventDefault(); saveAndGo(); }} data-testid="leave-save">Save and leave</AlertDialogAction>
          )}
          <AlertDialogAction onClick={go} className="bg-pl-danger hover:bg-pl-danger/90" data-testid="leave-anyway">Leave anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
