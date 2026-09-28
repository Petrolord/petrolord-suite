import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, UserPlus, Trash2, Shield, Lock, RefreshCw } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import ReassignSeatModal from '@/components/ReassignSeatModal';
import { getUserOrgRow } from '@/lib/orgContext';
import { AccountScope, AccountPage, AccountHeader, accountEmpty } from '@/components/account/accountChrome';

function SubscriptionManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
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
        const orgUser = await getUserOrgRow(user.id);
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
    <AccountPage>
      <AccountHeader
        eyebrow="Billing"
        title="App & Seat Management"
        description="Manage licenses and user assignments per application."
        actions={
          <Button variant="outline" onClick={() => navigate('/dashboard/subscriptions/renew')}>
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" /> Renew
          </Button>
        }
      />

      {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-pl-primary-text" aria-label="Loading subscriptions" /></div>
      ) : apps.length === 0 ? (
          <div className={accountEmpty}>No active subscriptions found.</div>
      ) : (
          <div className="grid grid-cols-1 gap-6">
              {apps.map(app => {
                  const appId = app.app_id || app.module_id;
                  const details = seatDetails[appId];
                  const isExpanded = expandedApp === appId;

                  return (
                      <Card key={app.id} className="min-w-0">
                          <CardHeader className="pb-3">
                              <div className="flex flex-wrap justify-between items-center gap-4">
                                  <div className="min-w-0">
                                      <CardTitle className="text-xl">{app.module_name}</CardTitle>
                                      <CardDescription>
                                          Expires: {new Date(app.expiry_date).toLocaleDateString()}
                                      </CardDescription>
                                  </div>
                                  <div className="flex items-center gap-4">
                                      <div className="text-right">
                                          <div className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">
                                              {details ? `${details.used_seats} / ${details.total_seats}` : `${app.current_seats_used || '?'} / ${app.seats_allocated}`}
                                          </div>
                                          <div className="text-xs text-pl-muted">Seats Used</div>
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
                                      <Button size="sm" disabled>
                                          <UserPlus className="w-4 h-4 mr-2" /> Add Member (Coming Soon)
                                      </Button>
                                  </div>
                                  <Table>
                                      <TableHeader>
                                          <TableRow>
                                              <TableHead>Seat #</TableHead>
                                              <TableHead>User</TableHead>
                                              <TableHead>Type</TableHead>
                                              <TableHead>Status</TableHead>
                                              <TableHead className="text-right">Actions</TableHead>
                                          </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                          {details.assignments.map(seat => (
                                              <TableRow key={seat.id}>
                                                  <TableCell className="font-pl-mono tabular-nums text-pl-muted">#{seat.seat_number}</TableCell>
                                                  <TableCell className="font-medium">{seat.user_name || 'Unknown'}</TableCell>
                                                  <TableCell>
                                                      {seat.is_admin_seat ? <Badge variant="accent" className="whitespace-nowrap">Admin Seat</Badge> : <Badge variant="neutral">Member</Badge>}
                                                  </TableCell>
                                                  <TableCell>
                                                      {seat.is_locked ? <Badge variant="danger"><Lock className="w-3 h-3 mr-1"/> Locked</Badge> : <Badge variant="success"><Shield className="w-3 h-3 mr-1"/> Active</Badge>}
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
                                                          <Button size="icon" variant="ghost" className="h-8 w-8 text-pl-danger-text hover:bg-pl-danger-bg hover:text-pl-danger-text" aria-label="Revoke access" onClick={() => handleRemoveSeat(seat.id, app.organization_id)}>
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
    </AccountPage>
  );
}

// Design system rollout batch 1E: the page opens its theme scope through AccountScope inside the dashboard scope.
export default function SubscriptionManagement() {
  return (
    <AccountScope testId="subscriptions-theme-scope">
      <SubscriptionManagementPage />
    </AccountScope>
  );
}