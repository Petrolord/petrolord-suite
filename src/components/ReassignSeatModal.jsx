import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { Loader2, UserCog } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ReassignSeatModal({ app, orgId, currentAdminId, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open && orgId) {
        fetchMembers();
    }
  }, [open, orgId]);

  const fetchMembers = async () => {
      setLoading(true);
      // Fetch potential assignees (excluding current admin)
      const { data } = await supabase
        .from('organization_users')
        .select('user_id')
        .eq('organization_id', orgId);
        
      if (data) {
          const userIds = data.map(u => u.user_id).filter(id => id !== currentAdminId);
          // Fetch names (assuming user_profiles or similar public table)
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', userIds);
          setMembers(profiles || []);
      }
      setLoading(false);
  };

  const handleReassign = async () => {
      if (!selectedMember) return;
      setLoading(true);
      try {
          const { error } = await supabase.functions.invoke('reassign-admin-seat-to-member', {
              body: {
                  app_id: app.app_id || app.module_id, // flexible ID
                  organization_id: orgId,
                  new_user_id: selectedMember,
                  admin_id: currentAdminId
              }
          });

          if (error) throw error;

          toast({ title: "Seat Reassigned", description: "You have transferred your admin seat." });
          setOpen(false);
          if (onSuccess) onSuccess();
      } catch (err) {
          console.error(err);
          toast({ title: "Error", description: "Failed to reassign seat.", variant: "destructive" });
      } finally {
          setLoading(false);
      }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs border-amber-500/50 text-amber-500 hover:bg-amber-500/10">
            <UserCog className="w-3 h-3 mr-1" /> Transfer My Seat
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle>Transfer Admin Seat</DialogTitle>
          <DialogDescription className="text-slate-400">
            Reassign your admin seat for <strong>{app.module_name}</strong> to a team member. 
            <br/><span className="text-amber-500 text-xs">Warning: You will lose access to this app after transfer.</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Select Team Member</label>
            <Select onValueChange={setSelectedMember} value={selectedMember}>
                <SelectTrigger className="bg-slate-950 border-slate-700">
                    <SelectValue placeholder="Select member..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-700 text-white">
                    {members.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name || 'Unknown User'}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>

        <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-400">Cancel</Button>
            <Button 
                onClick={handleReassign} 
                disabled={!selectedMember || loading}
                className="bg-amber-600 hover:bg-amber-700 text-white"
            >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirm Transfer
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}