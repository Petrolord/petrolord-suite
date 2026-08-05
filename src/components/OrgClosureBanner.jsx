import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

// Warns EVERY member of an organization that is scheduled for deletion.
// RLS scopes the query to orgs the caller belongs to, so no org id is needed.
export default function OrgClosureBanner() {
  const { user } = useAuth();
  const [closure, setClosure] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('org_closure_requests')
        .select('id, org_name, effective_at')
        .eq('status', 'scheduled')
        .order('effective_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setClosure(data || null);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!closure) return null;

  const effective = new Date(closure.effective_at);
  const daysLeft = Math.max(0, Math.ceil((effective.getTime() - Date.now()) / (24 * 3600 * 1000)));

  return (
    <div className="bg-red-950/80 border-b border-red-800 text-red-100 px-4 py-2 flex items-center gap-3 text-sm">
      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
      <span>
        <strong>{closure.org_name}</strong> is scheduled for permanent deletion on{' '}
        <strong>{effective.toLocaleDateString()}</strong> ({daysLeft} day{daysLeft === 1 ? '' : 's'} left).
        All data will be removed.
      </span>
      <Link to="/dashboard/data-export" className="ml-auto shrink-0 underline text-red-200 hover:text-white">
        Export data or cancel
      </Link>
    </div>
  );
}
