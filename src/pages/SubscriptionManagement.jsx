import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, UserPlus, Trash2, Shield, Lock } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import ReassignSeatModal from '@/components/ReassignSeatModal';

export default function SubscriptionManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedApp, setExpandedApp] = useState(null); // ID of expanded app for details
  const [seatDetails, setSeatDetails] = useState({}); // Cache for fetched seat details

  useEffect(() => {
    if (user) fetchSubscriptions();
  }, [user]);

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
        const { data: orgUser } = await supabase.from('organization_users').select('organization_id').eq('user_id', user.id).maybeSingle();
        if (orgUser) {
            const { data } = await supabase
                .from('purchased_modules')
                .select('*')
                .eq('organization_id', orgUser.organization_id)
                .eq('status', 'active'); // Only show active apps
            setApps(data || []);
        }
    } catch (e) {
        console.error("Fetch error", e);
    } finally {
        setLoading(false);
    }
  };

  const fetchSeatDetails = async (app) => {
      if (seatDetails[app.app_id]) return; // Already cached
      
      try {
          const { data, error } = await supabase.functions.invoke('get-app-seat-usage', {
              body: { organization_id: app.organization_id, app_id: app.app_id || app.module_id }
          });
          if (data) {
              setSeatDetails(prev => ({ ...prev, [app.app_id || app.module_id]: data }));
          }
      } catch (e) {
          console.error("Seat detail fetch error", e);
      }
  };

  const toggleAppDetails = (app) => {
      const appId = app.app_id || app.module_id;
      if (expandedApp === appId) {
          setExpandedApp(null);
      } else {
          setExpandedApp(appId);
          fetchSeatDetails(app);
      }
  };

  const handleAddSeat = async (appId, orgId) => {
      // Logic to add a member to next available seat
      // Usually involves a modal to select user. For brevity, assuming stub.
      const email = prompt("Enter email of user to assign next seat to:");
      // In real app, search user by email to get UUID, then call assign-app-to-user
      if(email) alert("Feature requires User Search implementation. Use Reassign for now.");
  };

  const handleRemoveSeat = async (assignmentId, orgId) => {
      if(!confirm("Revoke access for this user?")) return;
      try {
          const { error } = await supabase.functions.invoke('remove-member-from-app', {
              body: { assignment_id: assignmentId, organization_id: orgId, requested_by: user.id }
          });
          if(error) throw error;
          toast({ title: "Removed", description: "User access revoked." });
          // Refresh details
          const app = apps.find(a => (a.app_id || a.module_id) === expandedApp);
          if(app) fetchSeatDetails(app);
      } catch(e) {
          toast({ title: "Error", description: "Could not remove seat.", variant: "destructive" });
      }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-950 min-h-screen text-white">
      <h1 className="text-3xl font-bold text-white mb-1">App & Seat Management</h1>
      <p className="text-slate-400 mb-6">Manage licenses and user assignments per application.</p>

      {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-teal-500" /></div>
      ) : apps.length === 0 ? (
          <div className="text-center p-12 text-slate-500">No active subscriptions found.</div>
      ) : (
          <div className="grid gap-6">
              {apps.map(app => {
                  const appId = app.app_id || app.module_id;
                  const details = seatDetails[appId];
                  const isExpanded = expandedApp === appId;

                  return (
                      <Card key={app.id} className="bg-slate-900 border-slate-800">
                          <CardHeader className="pb-3">
                              <div className="flex justify-between items-center">
                                  <div>
                                      <CardTitle className="text-xl text-white">{app.module_name}</CardTitle>
                                      <CardDescription className="text-slate-400">
                                          Expires: {new Date(app.expiry_date).toLocaleDateString()}
                                      </CardDescription>
                                  </div>
                                  <div className="flex items-center gap-4">
                                      <div className="text-right">
                                          <div className="text-2xl font-bold text-white">
                                              {details ? `${details.used_seats} / ${details.total_seats}` : `${app.current_seats_used || '?'} / ${app.seats_allocated}`}
                                          </div>
                                          <div className="text-xs text-slate-500">Seats Used</div>
                                      </div>
                                      <Button variant={isExpanded ? "secondary" : "outline"} onClick={() => toggleAppDetails(app)}>
                                          {isExpanded ? "Hide Details" : "Manage Seats"}
                                      </Button>
                                  </div>
                              </div>
                          </CardHeader>
                          {isExpanded && details && (
                              <CardContent>
                                  <div className="mb-4 flex justify-end">
                                      {/* Add Seat Button Placeholder */}
                                      <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" disabled>
                                          <UserPlus className="w-4 h-4 mr-2" /> Add Member (Coming Soon)
                                      </Button>
                                  </div>
                                  <Table>
                                      <TableHeader>
                                          <TableRow className="border-slate-800">
                                              <TableHead className="text-slate-400">Seat #</TableHead>
                                              <TableHead className="text-slate-400">User</TableHead>
                                              <TableHead className="text-slate-400">Type</TableHead>
                                              <TableHead className="text-slate-400">Status</TableHead>
                                              <TableHead className="text-right text-slate-400">Actions</TableHead>
                                          </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                          {details.assignments.map(seat => (
                                              <TableRow key={seat.id} className="border-slate-800 hover:bg-slate-800/50">
                                                  <TableCell className="font-mono text-slate-500">#{seat.seat_number}</TableCell>
                                                  <TableCell className="font-medium text-white">{seat.user_name || 'Unknown'}</TableCell>
                                                  <TableCell>
                                                      {seat.is_admin_seat ? <Badge variant="outline" className="border-amber-500 text-amber-500">Admin Seat</Badge> : <Badge variant="outline" className="border-slate-600 text-slate-400">Member</Badge>}
                                                  </TableCell>
                                                  <TableCell>
                                                      {seat.is_locked ? <span className="flex items-center text-xs text-rose-400"><Lock className="w-3 h-3 mr-1"/> Locked</span> : <span className="flex items-center text-xs text-green-400"><Shield className="w-3 h-3 mr-1"/> Active</span>}
                                                  </TableCell>
                                                  <TableCell className="text-right">
                                                      {seat.can_reassign && seat.user_id === user.id && (
                                                          <ReassignSeatModal 
                                                              app={app} 
                                                              orgId={app.organization_id} 
                                                              currentAdminId={user.id} 
                                                              onSuccess={() => fetchSeatDetails(app)}
                                                          />
                                                      )}
                                                      {!seat.is_admin_seat && (
                                                          <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500 hover:bg-rose-900/20" onClick={() => handleRemoveSeat(seat.id, app.organization_id)}>
                                                              <Trash2 className="w-4 h-4" />
                                                          </Button>
                                                      )}
                                                  </TableCell>
                                              </TableRow>
                                          ))}
                                      </TableBody>
                                  </Table>
                              </CardContent>
                          )}
                      </Card>
                  );
              })}
          </div>
      )}
    </div>
  );
}