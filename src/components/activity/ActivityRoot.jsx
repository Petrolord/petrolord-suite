// Mounted once in the dashboard shell: reads the person's server jobs into
// Activity and keeps the leave guard on every page.
import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { startServerJobs } from '@/lib/activity/sources/serverJobs';
import LeaveGuard from './LeaveGuard';

export default function ActivityRoot() {
  const { user } = useAuth();
  const uid = user?.id || null;
  useEffect(() => (uid ? startServerJobs(supabase, uid) : undefined), [uid]);
  return <LeaveGuard />;
}
