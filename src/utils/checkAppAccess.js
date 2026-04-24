import { supabase } from '@/lib/customSupabaseClient';

/**
 * Utility to check app access imperatively (e.g. in route loaders or middleware).
 * Returns access level or null if no access.
 */
export async function checkAppAccess(userId, appId) {
    if (!userId || !appId) return { hasAccess: false, level: null };

    try {
        const { data: member } = await supabase
            .from('organization_members')
            .select('id')
            .eq('user_id', userId)
            .single();

        if (!member) return { hasAccess: false, level: null };

        const { data: access } = await supabase
            .from('employee_app_access')
            .select('access_level')
            .eq('member_id', member.id)
            .eq('app_id', appId)
            .single();

        if (access) {
            return { hasAccess: true, level: access.access_level || 'full' };
        }
        return { hasAccess: false, level: null };
    } catch (e) {
        console.error("Error checking access:", e);
        return { hasAccess: false, error: e };
    }
}