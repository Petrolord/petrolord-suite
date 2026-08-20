// Sessions & bookmarks manager (W1.2b). Sessions are full workspace
// snapshots; bookmarks are quick navigation points (volume, line,
// cameras). Both live in seismic_sessions (user-scoped RLS) and load
// fresh on every open. Capture/restore logic stays in ViewerPanel — the
// dialog only orchestrates the service and the two callbacks.

import React, { useCallback, useEffect, useState } from 'react';
import {
  BookMarked, Save, FolderOpen, Trash2, Loader2, MapPin,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { listSessions, saveSession, deleteSession } from '../../../services/sessionsService';

const when = (row) => {
  try {
    return new Date(row.updated_at).toLocaleString();
  } catch {
    return '';
  }
};

export default function SessionsDialog({
  open, onOpenChange, captureSession, restoreSession, captureBookmark,
  restoreBookmark, hasVolume,
}) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([listSessions('session'), listSessions('bookmark')]);
      setSessions(s);
      setBookmarks(b);
    } catch (e) {
      toast({ title: 'Could not load sessions', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const saveAs = async (kind, capture) => {
    // eslint-disable-next-line no-alert
    const name = window.prompt(
      kind === 'session' ? 'Session name (an existing name is overwritten):'
        : 'Bookmark name (an existing name is overwritten):',
    );
    if (!name) return;
    try {
      await saveSession({ name, kind, payload: capture() });
      toast({ title: kind === 'session' ? 'Session saved' : 'Bookmark saved', description: name.trim() });
      await refresh();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const load = async (row, restore) => {
    setBusyId(row.id);
    try {
      await restore(row.payload);
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Restore failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete ${row.kind} "${row.name}"?`)) return;
    setBusyId(row.id);
    try {
      await deleteSession(row);
      await refresh();
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const rowLine = (row, restore) => (
    <div
      key={row.id}
      className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1.5"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-200 truncate">{row.name}</div>
        <div className="text-[11px] text-slate-500">{when(row)}</div>
      </div>
      <Button
        variant="outline" size="sm" disabled={busyId === row.id}
        onClick={() => load(row, restore)} title="Open"
      >
        {busyId === row.id ? <Loader2 className="w-4 h-4 animate-spin" />
          : <FolderOpen className="w-4 h-4" />}
      </Button>
      <Button
        variant="outline" size="sm" disabled={busyId === row.id}
        onClick={() => remove(row)} title="Delete"
      >
        <Trash2 className="w-4 h-4 text-red-400" />
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <BookMarked className="w-5 h-5 mr-2 text-cyan-400" />
            Sessions & bookmarks
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wider text-slate-500">Sessions</div>
              <Button variant="outline" size="sm" onClick={() => saveAs('session', captureSession)}>
                <Save className="w-4 h-4 mr-1" />
                Save current…
              </Button>
            </div>
            <div className="space-y-1.5">
              {sessions.map((row) => rowLine(row, restoreSession))}
              {!loading && sessions.length === 0 && (
                <div className="text-xs text-slate-500 px-1">
                  No saved sessions yet. A session stores the whole workspace:
                  volume, line, display settings, layers, windows, and cameras.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wider text-slate-500">Bookmarks</div>
              <Button
                variant="outline" size="sm"
                onClick={() => saveAs('bookmark', captureBookmark)}
                disabled={!hasVolume}
                title={hasVolume ? 'Bookmark the current view' : 'Open a volume first'}
              >
                <MapPin className="w-4 h-4 mr-1" />
                Bookmark view…
              </Button>
            </div>
            <div className="space-y-1.5">
              {bookmarks.map((row) => rowLine(row, restoreBookmark))}
              {!loading && bookmarks.length === 0 && (
                <div className="text-xs text-slate-500 px-1">
                  No bookmarks yet. A bookmark returns to a volume, line, and
                  camera position in one click.
                </div>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex justify-center text-cyan-300 py-2">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
