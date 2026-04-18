import React, { useState } from 'react';
import { Camera, Clock, Save, Download, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export const SnapshotManager = () => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = () => {
    toast({ title: "Snapshot Saved", description: "Current risk register state has been captured." });
    setIsOpen(false);
  };

  const handleAction = (action) => {
    toast({ description: `🚧 ${action} feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀` });
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
            <h4 className="text-sm font-medium text-slate-200">Create New Snapshot</h4>
            <div className="space-y-2">
              <Label>Snapshot Name</Label>
              <Input placeholder="e.g., Q3 2026 Board Review" className="bg-slate-900 border-slate-700" />
            </div>
            <Button onClick={handleSave} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white">
              <Save className="w-4 h-4 mr-2" /> Capture Current State
            </Button>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-200 flex items-center gap-2 mt-4">
              <Clock className="w-4 h-4 text-slate-400" /> Recent Snapshots
            </h4>
            
            {/* Mock Data */}
            <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-200">Q2 2026 Summary</p>
                <p className="text-xs text-slate-500">June 30, 2026 • 42 Risks</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => handleAction('Compare')} title="Compare">
                  <ArrowLeftRight className="w-4 h-4 text-slate-400 hover:text-cyan-400" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleAction('Export')} title="Export">
                  <Download className="w-4 h-4 text-slate-400 hover:text-cyan-400" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};