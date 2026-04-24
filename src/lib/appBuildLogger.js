import { supabase } from './customSupabaseClient';

/**
 * Auto-logging utility for application build lifecycle.
 * Updates master_apps status and logs entry to app_build_history.
 * 
 * @param {string} appId - UUID of the app in master_apps
 * @param {string} appName - Name of the application
 * @param {'created' | 'updated' | 'fixed' | 'tested'} action - The action performed
 * @param {string} description - Description of the work done
 * @param {string} userEmail - (Optional) Email of the builder/tester. Defaults to current auth user if not provided.
 */
export const logAppBuild = async (appId, appName, action, description, userEmail = null) => {
  try {
    // 1. Get current user if not provided
    let builtBy = userEmail;
    if (!builtBy) {
      const { data: { user } } = await supabase.auth.getUser();
      builtBy = user?.email || 'Unknown User';
    }

    // 2. Prepare master_apps updates based on action
    const updates = { updated_at: new Date().toISOString() };
    
    switch (action) {
      case 'created':
        updates.is_built = true;
        updates.status = 'Active'; // Per Task 5 requirement
        break;
      case 'fixed':
        // Just timestamp update, handled by default
        break;
      case 'tested':
        updates.is_functional = true;
        break;
      case 'updated':
        // Just timestamp update
        break;
      default:
        console.warn(`Unknown action: ${action}`);
    }

    // 3. Update Master App
    const { error: masterError } = await supabase
      .from('master_apps')
      .update(updates)
      .eq('id', appId);

    if (masterError) {
      console.error('Error updating master_apps:', masterError);
      return { success: false, error: masterError };
    }

    // 4. Log History
    const { error: historyError } = await supabase
      .from('app_build_history')
      .insert({
        app_id: appId,
        app_name: appName,
        action,
        description,
        built_by: builtBy
      });

    if (historyError) {
      console.error('Error inserting build history:', historyError);
      return { success: false, error: historyError };
    }

    return { success: true };

  } catch (err) {
    console.error('Unexpected error in logAppBuild:', err);
    return { success: false, error: err };
  }
};

/**
 * Helper to fetch build history for a specific app
 */
export const getAppBuildHistory = async (appId) => {
    const { data, error } = await supabase
        .from('app_build_history')
        .select('*')
        .eq('app_id', appId)
        .order('created_at', { ascending: false });
    
    return { data, error };
};