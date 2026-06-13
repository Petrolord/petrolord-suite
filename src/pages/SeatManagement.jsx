import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ArrowLeft, Users, UserPlus, X, Loader2, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

// Per-app seat management. The admin assigns purchased seats to org members
// (including, optionally, themselves). The cap lives in
// purchased_modules.seats_allocated; assignment goes through the guarded
// assign_app_seat / unassign_app_seat RPCs which enforce membership + cap.
export default function SeatManagement() {
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
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/modules')} className="text-slate-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Seat Assignments</h1>
              <p className="text-slate-400">Assign purchased seats to members — per app. You don't have to take a seat yourself.</p>
            </div>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" className="border-slate-700 hover:bg-slate-800">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 bg-slate-900 rounded-lg border border-slate-800">Loading seats…</div>
        ) : apps.length === 0 ? (
          <Card className="bg-slate-900 border-slate-800 border-dashed">
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="text-slate-400 mb-4">No purchased apps with seats yet.</p>
              <Button className="bg-lime-600 hover:bg-lime-700 text-white" onClick={() => navigate('/dashboard/upgrade')}>
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
                <Card key={app.app_id} className="bg-slate-900 border-slate-800">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="w-5 h-5 text-lime-400" />
                        <h3 className="font-bold text-lg">{app.name}</h3>
                      </div>
                      <Badge className={`${full ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                        <Users className="w-3 h-3 mr-1" /> {used} / {unlimited ? '∞' : app.allocated} seats
                      </Badge>
                    </div>

                    {/* Assigned members */}
                    <div className="space-y-2 mb-4">
                      {app.assignments.length === 0 ? (
                        <p className="text-sm text-slate-500">No one assigned yet.</p>
                      ) : app.assignments.map(a => {
                        const key = `${app.app_id}:${a.user_id}`;
                        return (
                          <div key={a.user_id} className="flex items-center justify-between bg-slate-950 rounded px-3 py-2 border border-slate-800">
                            <div>
                              <div className="text-sm font-medium">{a.full_name}</div>
                              <div className="text-xs text-slate-500">{a.email}</div>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-red-400 hover:bg-red-900/20"
                              disabled={busyKey === key}
                              onClick={() => unassign(app.app_id, a.user_id)}>
                              {busyKey === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            </Button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Assign picker */}
                    <div className="flex items-center gap-2">
                      <Select
                        value={picker[app.app_id] || ''}
                        onValueChange={(v) => setPicker(prev => ({ ...prev, [app.app_id]: v }))}
                        disabled={full || available.length === 0}
                      >
                        <SelectTrigger className="bg-slate-950 border-slate-700 flex-1">
                          <SelectValue placeholder={full ? 'All seats taken' : available.length === 0 ? 'No more members to assign' : 'Select a member…'} />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-950 border-slate-700 text-white">
                          {available.map(m => (
                            <SelectItem key={m.user_id} value={m.user_id}>
                              {m.full_name || m.email} <span className="text-slate-500">({m.email})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        className="bg-lime-600 hover:bg-lime-700 text-white"
                        disabled={full || !picker[app.app_id] || busyKey?.startsWith(`${app.app_id}:`)}
                        onClick={() => assign(app.app_id, picker[app.app_id])}
                      >
                        <UserPlus className="w-4 h-4 mr-2" /> Assign
                      </Button>
                    </div>
                    {full && <p className="text-xs text-amber-500 mt-2">All seats are assigned. Remove someone or purchase more seats to add others.</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
