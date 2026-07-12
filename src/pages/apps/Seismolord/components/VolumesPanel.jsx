import React, { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { listVolumes, deleteVolume } from '../services/volumesService';

const STATUS_STYLE = {
  ready: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50',
  ingesting: 'bg-amber-900/50 text-amber-300 border-amber-700/50',
  registered: 'bg-slate-800 text-slate-300 border-slate-700',
};

function geometrySummary(meta) {
  if (!meta?.il) return null;
  return `IL ${meta.il.min}–${meta.il.max} · XL ${meta.xl.min}–${meta.xl.max} · `
    + `${meta.ns} samples @ ${meta.dt_us / 1000} ms`;
}

export default function VolumesPanel({ refreshKey, onDeleted }) {
  const { toast } = useToast();
  const [volumes, setVolumes] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setVolumes(await listVolumes());
    } catch (e) {
      setError(e.message);
      setVolumes([]);
    }
  }, []);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  const onDelete = async (v) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${v.name}" and all of its brick data? This cannot be undone.`)) return;
    setBusyId(v.id);
    try {
      await deleteVolume(v);
      toast({ title: 'Volume deleted', description: v.name });
      await reload();
      // let the page bump the shared refresh key so the viewer drops the
      // volume if it was the selected one (L7 — endless brick 404s)
      if (onDeleted) onDeleted(v);
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-white flex items-center">
          <Database className="w-5 h-5 mr-2 text-cyan-400" />
          My volumes
        </CardTitle>
        <Button variant="outline" size="sm" onClick={reload}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {volumes === null && (
          <div className="flex items-center text-slate-300">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading…
          </div>
        )}
        {error && <div className="text-red-400 text-sm">{error}</div>}
        {volumes && volumes.length === 0 && !error && (
          <p className="text-slate-400 text-sm">
            No volumes yet — import a SEG-Y file to get started.
          </p>
        )}
        {volumes && volumes.length > 0 && (
          <ul className="divide-y divide-slate-800">
            {volumes.map((v) => (
              <li key={v.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{v.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLE[v.status] || STATUS_STYLE.registered}`}>
                      {v.status}
                    </span>
                  </div>
                  <div className="text-sm text-slate-400 truncate">
                    {geometrySummary(v.survey_meta) || 'No geometry recorded'}
                    {' · '}
                    {new Date(v.created_at).toLocaleString()}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-800/60 text-red-400 hover:bg-red-950/40 shrink-0"
                  disabled={busyId === v.id}
                  onClick={() => onDelete(v)}
                >
                  {busyId === v.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
