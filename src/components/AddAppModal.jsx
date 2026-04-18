import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

const AddAppModal = ({ isOpen, onClose, organization, existingAppIds, superAdminId, onSuccess, masterApps }) => {
  const [selectedAppId, setSelectedAppId] = useState('');
  const [seats, setSeats] = useState(10);
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Filter master apps to exclude those already added
  const availableApps = masterApps.filter(app => !existingAppIds.includes(app.app_id));

  const handleAdd = async () => {
    if (!selectedAppId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select an application.' });
      return;
    }
    if (seats < 1) {
        toast({ variant: 'destructive', title: 'Error', description: 'Seats must be at least 1.' });
        return;
    }

    setLoading(true);
    try {
      // Find the selected app details from masterApps
      const selectedApp = masterApps.find(a => a.app_id === selectedAppId);

      // Prepare payload for the edge function
      // Note: The edge function expects an array of entitlements.
      // We are adding a NEW entitlement here. The edge function as written in previous steps 
      // upserts. So we can just send this one new record.
      const payload = {
        organization_id: organization.id,
        entitlements: [{
            app_id: selectedAppId,
            module_id: selectedApp?.module_id || 'general', // Fallback if not in master_apps
            seats_allocated: parseInt(seats),
            status: status
        }],
        super_admin_id: superAdminId
      };

      const { data, error } = await supabase.functions.invoke('admin-update-org-entitlements', {
        body: payload
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Unknown error');

      toast({ title: 'Success', description: 'Application added successfully.' });
      console.log(`AddAppModal: Added app ${selectedAppId} to org ${organization.name}`);
      onSuccess();
      onClose();
      // Reset form
      setSelectedAppId('');
      setSeats(10);
      setStatus('active');

    } catch (error) {
      console.error('AddAppModal: Error adding app:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 text-white border-slate-800">
        <DialogHeader>
          <DialogTitle>Add Application to {organization?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Application</label>
            <Select value={selectedAppId} onValueChange={setSelectedAppId}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Select an application" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                {availableApps.length === 0 ? (
                    <SelectItem value="none" disabled>No more apps available</SelectItem>
                ) : (
                    availableApps.map((app) => (
                    <SelectItem key={app.id || app.app_id} value={app.app_id}>
                        {app.name || app.app_name} ({app.app_id})
                    </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Allocated Seats</label>
            <Input 
              type="number" 
              value={seats} 
              onChange={(e) => setSeats(e.target.value)}
              min={1}
              max={1000}
              className="bg-slate-800 border-slate-700 text-white"
            />
            {seats > 100 && (
                <p className="text-xs text-amber-500">Warning: High seat count selected.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-slate-700 text-slate-400">Cancel</Button>
          <Button onClick={handleAdd} disabled={loading || !selectedAppId} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}
            Add App
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddAppModal;