import { supabase } from '@/lib/customSupabaseClient';

/**
 * Checks if a user has access to a specific application within an organization context.
 * 
 * @param {Object} user - The user object from AuthContext
 * @param {Object} organization - The organization object
 * @param {string} appId - The ID or slug of the application to check
 * @returns {Promise<boolean>} - True if access is allowed
 */
export const canAccessApp = async (user, organization, appId) => {
  console.log(`AccessControl: Checking access for User: ${user?.id}, Org: ${organization?.id}, App: ${appId}`);

  if (!user || !organization || !appId) {
    console.log("AccessControl: Missing required parameters.");
    return false;
  }

  try {
    // 1. Check Super Admin
    if (user.is_super_admin === true || user.user_metadata?.is_super_admin === true) {
      console.log("AccessControl: User is Super Admin. Access GRANTED.");
      return true;
    }

    // 2. Check Organization Subscription Status
    if (organization.subscription_status !== 'active' && organization.subscription_status !== 'functional') {
      console.log(`AccessControl: Organization status is ${organization.subscription_status}. Access DENIED.`);
      return false;
    }

    // 3. Check Organization Entitlements (organization_apps)
    const { data: orgApp, error: orgAppError } = await supabase
      .from('organization_apps')
      .select('status, seats_allocated, seats_used')
      .eq('organization_id', organization.id)
      .eq('app_id', appId)
      .single();

    if (orgAppError || !orgApp) {
      console.log("AccessControl: App not entitled to organization. Access DENIED.");
      return false;
    }

    if (orgApp.status !== 'active') {
      console.log("AccessControl: Org entitlement inactive. Access DENIED.");
      return false;
    }

    // 4. Check User App Access (Specific grant)
    const { data: userAccess, error: userAccessError } = await supabase
      .from('user_app_access')
      .select('is_active, expires_at')
      .eq('user_id', user.id)
      .eq('app_name', appId) // Assuming app_id maps to app_name
      .single();

    if (userAccess) {
      if (!userAccess.is_active) {
        console.log("AccessControl: User access explicitly inactive. Access DENIED.");
        return false;
      }
      if (userAccess.expires_at && new Date(userAccess.expires_at) < new Date()) {
        console.log("AccessControl: User access expired. Access DENIED.");
        return false;
      }
      console.log("AccessControl: User has explicit active access. Access GRANTED.");
      return true;
    }

    // 5. Fallback: Check if Seats Available (if no explicit user grant, maybe implied by role?)
    // Typically, user MUST have a record in user_app_access or be an admin.
    // Let's assume admins get access if seat count allows, or maybe ALL admins get access?
    // For this implementation, we require explicit grant or super admin. 
    // BUT, if the user is an org_admin, they might have implicit access? 
    // Let's stick to explicit grant check for standard users.
    
    console.log("AccessControl: No explicit user access found. Access DENIED.");
    return false;

  } catch (error) {
    console.error("AccessControl: Error checking access", error);
    return false;
  }
};