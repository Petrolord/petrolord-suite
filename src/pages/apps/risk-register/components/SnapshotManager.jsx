import React, { useState } from 'react';
import { Camera, Clock, Save, Download, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRiskSnapshots } from '../hooks/useRiskSnapshots';

/**
 * AS2. Before this, "Capture Current State" toasted "Snapshot Saved:
 * Current risk register state has been captured" and wrote nothing, and
 * the list below it held one invented snapshot, "Q2 2026 Summary, 42
 * Risks". Snapshots are rows in `risk_register_snapshots` now.
 *
 * Compare is not here. It was a "not implemented" toast, and a button
 * that does nothing is worse than no button; it returns when there is
 * something real behind it.
 */
export const SnapshotManager = ({ risks = [] }) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const { snapshots, loading, error, saveSnapshot, deleteSnapshot } = useRiskSnapshots();

  const handleSave = async () => {
    setSaving(true);
    const res = await saveSnapshot(name, risks);
    setSaving(false);
    if (res.success) {
      toast({
        title: 'Snapshot saved',
        description: `"${res.data.name}" captured ${risks.length} risk${risks.length === 1 ? '' : 's'}.`,
      });
      setName('');
    } else {
      toast({ variant: 'destructive', title: 'Snapshot not saved', description: res.error });
    }
  };

  const handleExport = (snapshot) => {
    const blob = new Blob([JSON.stringify(snapshot.snapshot_data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snapshot.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (snapshot) => {
    if (!window.confirm(`Delete the snapshot "${snapshot.name}"? This cannot be undone.`)) return;
    const res = await deleteSnapshot(snapshot.id);
    if (!res.success) {
      toast({ variant: 'destructive', title: 'Not deleted', description: res.error });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-slate-900 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
          <Camera className="w-4 h-4 mr-2" /> Save Snapshot
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Snapshot Management</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-4">
            <h4 className="text-sm font-medium text-slate-200">Create new snapshot</h4>
            <div className="space-y-2">
              <Label>Snapshot name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Q3 2026 Board Review"
                className="bg-slate-900 border-slate-700"
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Capture {risks.length} risk{risks.length === 1 ? '' : 's'}
            </Button>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-200 flex items-center gap-2 mt-4">
              <Clock className="w-4 h-4 text-slate-400" /> Saved snapshots
            </h4>

            {loading && <p className="text-xs text-slate-500">Loading…</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!loading && !error && snapshots.length === 0 && (
              <p className="text-sm text-slate-500 italic">
                No snapshots yet. The first one you capture will appear here.
              </p>
            )}

            {snapshots.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(s.created_at).toLocaleDateString()}
                    {' • '}
                    {s.snapshot_data?.risk_count ?? s.snapshot_data?.risks?.length ?? 0} risks
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => handleExport(s)} title="Export as JSON">
                    <Download className="w-4 h-4 text-slate-400 hover:text-cyan-400" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(s)} title="Delete">
                    <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
