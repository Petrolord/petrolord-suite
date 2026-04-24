export const validateTrackConfig = (config) => {
  if (!config || !config.type) return { valid: false, error: 'Missing type' };
  const validTypes = ['LOG', 'DEPTH', 'IMAGE'];
  if (!validTypes.includes(config.type)) return { valid: false, error: 'Invalid type' };
  return { valid: true };
};