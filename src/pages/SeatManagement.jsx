import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Users, UserPlus, X, Loader2, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { AccountScope, AccountPage, AccountHeader, accountEmpty, accountRow } from '@/components/account/accountChrome';

// Per-app seat management. The admin assigns purchased seats to org members
// (including, optionally, themselves). The cap lives in
// purchased_modules.seats_allocated; assignment goes through the guarded
// assign_app_seat / unassign_app_seat RPCs which enforce membership + cap.
function SeatManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organization } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null); // `${appId}:${userId}` while a row mutates
  const [apps, setApps] = useState([]);          // [{ app_id, name, allocated, assignments: [{user_id, full_name, email}] }]
  const [members, setMembers] = useState([]);     // [{ user_id, full_name, email }]
  const [picker, setPicker] = useState({});       // { [appId]: selectedUserId }

  const load = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      // 1. Purchased apps (app-level rows only) = what has seats to assign.
      const { data: purchases, error: pErr } = await supabase
        .from('purchased_modules')
        .select('app_id, module_name, seats_allocated')
        .eq('organization_id', organization.id)
        .eq('status', 'active')
        .not('app_id', 'is', null);
      if (pErr) throw pErr;

      // 2. Members (assignable) + 3. current assignments, in parallel.
      const [{ data: mem }, { data: assigns }, { data: master }] = await Promise.all([
        supabase.from('organization_members')
          .select('user_id, full_name, email, status')
          .eq('organization_id', organization.id)
          .not('user_id', 'is', null),
        supabase.from('app_seat_assignments')
          .select('app_id, user_id, seat_number')
          .eq('organization_id', organization.id),
        supabase.from('master_apps').select('id, app_name'),
      ]);

      const nameById = {};
      (master || []).forEach(a => { nameById[a.id] = a.app_name; });
      const memberList = (mem || []).filter(m => m.status !== 'inactive');
      const memberById = {};
      memberList.forEach(m => { memberById[m.user_id] = m; });

      const assignsByApp = {};
      (assigns || []).forEach(a => {
        (assignsByApp[a.app_id] = assignsByApp[a.app_id] || []).push(a);
      });

      const appRows = (purchases || []).map(p => ({
        app_id: p.app_id,
        name: nameById[p.app_id] || p.module_name || 'App',
        allocated: p.seats_allocated, // null = unlimited
        assignments: (assignsByApp[p.app_id] || []).map(a => ({
          user_id: a.user_id,
          full_name: memberById[a.user_id]?.full_name || 'Unknown user',
          email: memberById[a.user_id]?.email || a.user_id,
        })),
      }));

      setApps(appRows);
      setMembers(memberList.map(m => ({ user_id: m.user_id, full_name: m.full_name, email: m.email })));
    } catch (err) {
      console.error('SeatManagement load error:', err);
      toast({ title: 'Could not load seats', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => { load(); }, [load]);

  const assign = async (appId, userId) => {
    if (!userId) return;
    setBusyKey(`${appId}:${userId}`);
    try {
      const { data, error } = await supabase.rpc('assign_app_seat', {
        p_organization_id: organization.id,
        p_app_id: appId,
        p_user_id: userId,
      });
      if (error) throw error;
      if (data?.status !== 'success') {
        const reasons = {
          seat_limit_reached: 'All seats for this app are taken. Unassign one or buy more.',
          user_not_member: 'That user is not a member of this organization.',
          app_not_purchased: 'This app is not active on your subscription.',
          not_authorized: 'You do not have permission to manage seats.',
        };
        toast({ title: 'Could not assign seat', description: reasons[data?.reason] || data?.reason || 'Unknown error', variant: 'destructive' });
        return;
      }
      toast({ title: 'Seat assigned' });
      setPicker(prev => ({ ...prev, [appId]: '' }));
      await load();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBusyKey(null);
    }
  };

  const unassign = async (appId, userId) => {
    setBusyKey(`${appId}:${userId}`);
    try {
      const { data, error } = await supabase.rpc('unassign_app_seat', {
        p_organization_id: organization.id,
        p_app_id: appId,
        p_user_id: userId,
      });
      if (error) throw error;
      if (data?.status !== 'success') {
        toast({ title: 'Could not remove seat', description: data?.reason || 'Unknown error', variant: 'destructive' });
        return;
      }
      toast({ title: 'Seat removed' });
      await load();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <AccountPage width="max-w-5xl">
        <AccountHeader
          eyebrow="Billing"
          title="Seat Assignments"
          description="Assign purchased seats to members, app by app. You don't have to take a seat yourself."
          backTo="/dashboard/modules"
          backLabel="Back to module access"
          actions={
            <Button onClick={load} disabled={loading} variant="outline">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          }
        />

        {loading ? (
          <div className={accountEmpty}>Loading seats…</div>
        ) : apps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-pl-muted mx-auto mb-2" aria-hidden="true" />
              <p className="text-pl-muted mb-4">No purchased apps with seats yet.</p>
              <Button onClick={() => navigate('/dashboard/upgrade')}>
                Purchase Apps
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {apps.map(app => {
              const used = app.assignments.length;
              const unlimited = app.allocated === null || app.allocated === undefined;
              const full = !unlimited && used >= app.allocated;
              const assignedIds = new Set(app.assignments.map(a => a.user_id));
              const available = members.filter(m => !assignedIds.has(m.user_id));
              return (
                <Card key={app.app_id}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <ShieldCheck className="w-5 h-5 shrink-0 text-pl-muted" aria-hidden="true" />
                        <h3 className="font-bold text-lg text-pl-text">{app.name}</h3>
                      </div>
                      <Badge variant={full ? 'warning' : 'neutral'}>
                        <Users className="w-3 h-3 mr-1" aria-hidden="true" /> {used} / {unlimited ? '∞' : app.allocated} seats
                      </Badge>
                    </div>

                    {/* Assigned members */}
                    <div className="space-y-2 mb-4">
                      {app.assignments.length === 0 ? (
                        <p className="text-sm text-pl-muted">No one assigned yet.</p>
                      ) : app.assignments.map(a => {
                        const key = `${app.app_id}:${a.user_id}`;
                        return (
                          <div key={a.user_id} className={accountRow}>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-pl-text">{a.full_name}</div>
                              <div className="truncate text-xs text-pl-muted">{a.email}</div>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-pl-danger-text hover:bg-pl-danger-bg hover:text-pl-danger-text"
                              aria-label={`Remove ${a.full_name}`}
                              disabled={busyKey === key}
                              onClick={() => unassign(app.app_id, a.user_id)}>
                              {busyKey === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            </Button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Assign picker */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Select
                        value={picker[app.app_id] || ''}
                        onValueChange={(v) => setPicker(prev => ({ ...prev, [app.app_id]: v }))}
                        disabled={full || available.length === 0}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder={full ? 'All seats taken' : available.length === 0 ? 'No more members to assign' : 'Select a member…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {available.map(m => (
                            <SelectItem key={m.user_id} value={m.user_id}>
                              {m.full_name || m.email} <span className="text-pl-muted">({m.email})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        disabled={full || !picker[app.app_id] || busyKey?.startsWith(`${app.app_id}:`)}
                        onClick={() => assign(app.app_id, picker[app.app_id])}
                      >
                        <UserPlus className="w-4 h-4 mr-2" /> Assign
                      </Button>
                    </div>
                    {full && <p className="text-xs text-pl-warning-text mt-2">All seats are assigned. Remove someone or purchase more seats to add others.</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
    </AccountPage>
  );
}

// Design system rollout batch 1E: the page opens its theme scope through AccountScope inside the dashboard scope.
export default function SeatManagement() {
  return (
    <AccountScope testId="seat-management-theme-scope">
      <SeatManagementPage />
    </AccountScope>
  );
}
