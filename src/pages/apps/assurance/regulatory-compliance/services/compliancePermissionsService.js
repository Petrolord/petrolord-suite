import { supabase } from '@/lib/customSupabaseClient';

export const compliancePermissionsService = {
  async checkAccess() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { hasAccess: false, role: null };

      const { data, error } = await supabase
        .from('organization_users')
        .select('role, user_role, organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (error || !data) return { hasAccess: false, role: null };

      // Allow if they are in the org. You can refine this based on specific compliance roles.
      return { 
        hasAccess: true, 
        role: data.role || data.user_role,
        orgId: data.organization_id
      };
    } catch (err) {
      console.error("Permission check failed:", err);
      return { hasAccess: false, role: null };
    }
  }
};