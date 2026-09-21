import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { memberName } from './people';

/**
 * AS13 — the organization's members, for the person pickers.
 *
 * organization_members is the Suite's one membership table, and its
 * read policy lets any member see the members of their own
 * organization. Scoped by org_id in code as well, as every Assurance
 * hook is.
 *
 * A failed read is reported, and the forms fall back to a typed name:
 * the independence checks still compare typed names, so a failed list
 * never lets two same-named people through.
 */
export const useOrgMembers = () => {
  const { organization, user } = useAuth();
  const orgId = organization?.id || null;
  const userId = user?.id || null;
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orgId) return undefined;
    let live = true;
    supabase
      .from('organization_members')
      .select('user_id, full_name, email, status')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('full_name', { ascending: true })
      .then(({ data, error: err }) => {
        if (!live) return;
        if (err) {
          setError(err.message || 'The member list could not be loaded.');
          setMembers([]);
          return;
        }
        setError(null);
        setMembers((data || []).filter((m) => m.user_id));
      });
    return () => { live = false; };
  }, [orgId]);

  const nameOf = useCallback(
    (id) => memberName(members.find((m) => m.user_id === id)), [members]);

  /** The signed-in user's own name, from the member list or their account. */
  const selfName = useMemo(() => nameOf(userId)
    || String(user?.user_metadata?.full_name || '').trim()
    || user?.email
    || null, [nameOf, userId, user]);

  return { members, error, userId, nameOf, selfName };
};

export default useOrgMembers;
