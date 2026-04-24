/**
 * Utility for normalizing Module and App IDs to ensure consistency across the platform.
 * This handles cases where IDs might be stored as "Module: X" or "X" or different casing.
 */

/**
 * Normalizes a module ID string.
 * @param {string} id - The raw module ID or name.
 * @returns {string} - The normalized ID (lowercase, alphanumeric only).
 */
export const normalizeModuleId = (id) => {
  if (!id) return '';
  let normalized = id.toLowerCase();
  
  // Remove common prefixes
  normalized = normalized.replace(/^module:\s*/, '');
  
  // Keep alphanumeric only for strict comparison
  return normalized.replace(/[^a-z0-9]/g, '');
};

/**
 * Normalizes an app ID string.
 * @param {string} id - The raw app ID or name.
 * @returns {string} - The normalized ID.
 */
export const normalizeAppId = (id) => {
  if (!id) return '';
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Derives a parent module ID from an App ID if possible.
 * This is a heuristic helper and may need a mapping table for complex cases.
 * @param {string} appId 
 * @returns {string}
 */
export const getModuleFromAppId = (appId) => {
  const normalized = normalizeAppId(appId);
  
  // Simple mapping for known apps
  if (['wellplanning', 'drilling'].includes(normalized)) return 'drilling';
  if (['economics', 'pep'].includes(normalized)) return 'economics';
  if (['geoscience', 'subsurfacestudio'].includes(normalized)) return 'geoscience';
  
  // Fallback: assume 1-to-1 mapping if unknown
  return normalized;
};