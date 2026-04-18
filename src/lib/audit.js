import { supabase } from '@/lib/customSupabaseClient';

/**
 * Helper to log audit events from the client side.
 * Relies on the 'log-audit-event' edge function.
 */
export async function logAuditEvent(organizationId, action, resourceType, resourceId, details = {}) {
  try {
    const { error } = await supabase.functions.invoke('log-audit-event', {
      body: {
        organization_id: organizationId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details,
        // user_agent and ip are captured server-side from headers
      }
    });

    if (error) console.error("Failed to log audit event:", error);
  } catch (err) {
    console.error("Audit logging exception:", err);
  }
}