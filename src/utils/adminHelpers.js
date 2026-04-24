import { format } from 'date-fns';
import { applications } from '@/data/applications';

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const formatDate = (dateString) => {
  if (!dateString) return '-';
  return format(new Date(dateString), 'MMM d, yyyy');
};

export const capitalize = (s) => {
  if (typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Normalizes DB module names to Dashboard ID keys.
 * Used for access control checks.
 */
export const normalizeModuleName = (name) => {
    if (!name) return '';
    const lowerName = name.toLowerCase().trim();
    
    // Specific application overrides
    if (lowerName.includes('fluid systems')) return 'reservoir';
    if (lowerName.includes('decline curve')) return 'reservoir';
    if (lowerName.includes('reservoir balance')) return 'reservoir';
    if (lowerName.includes('eor')) return 'reservoir';
    
    if (lowerName.includes('well planning')) return 'drilling';
    if (lowerName.includes('casing')) return 'drilling';
    if (lowerName.includes('drilling fluids')) return 'drilling';
    
    if (lowerName.includes('nodal')) return 'production';
    if (lowerName.includes('production')) return 'production'; // catches 'production operations'
    
    // Core Module mappings
    if (lowerName.includes('geoscience')) return 'geoscience';
    if (lowerName.includes('reservoir')) return 'reservoir';
    if (lowerName.includes('drilling')) return 'drilling';
    if (lowerName.includes('economics')) return 'economics';
    if (lowerName.includes('facilities')) return 'facilities';
    if (lowerName.includes('assurance')) return 'assurance';
    if (lowerName.includes('hse')) return 'hse';
    
    // Default fallback (returns original if no match, simplified)
    return lowerName.replace(/\s+/g, '-');
};

// Helper to get list of all available modules
export const getModuleList = () => {
  return [
    { id: 'hse_free', name: 'HSE Free', description: 'Basic HSE reporting and tracking', type: 'core', required: true },
    { id: 'hse_premium', name: 'HSE Premium', description: 'Advanced HSE analytics and AI features', type: 'addon' },
    { id: 'geoscience', name: 'Geoscience & Analytics', description: 'Subsurface analysis and modeling tools', type: 'suite' },
    { id: 'reservoir', name: 'Reservoir Management', description: 'Reservoir engineering and simulation', type: 'suite' },
    { id: 'production', name: 'Production Operations', description: 'Production monitoring and optimization', type: 'suite' },
    { id: 'drilling', name: 'Drilling & Completions', description: 'Well planning and drilling operations', type: 'suite' },
    { id: 'facilities', name: 'Facilities Engineering', description: 'Surface facilities design and management', type: 'suite' },
    { id: 'economics', name: 'Economics & Planning', description: 'Asset valuation and portfolio management', type: 'suite' }
  ];
};

// Helper to get apps belonging to a specific module
export const getAppsByModule = (moduleId) => {
  if (applications && Array.isArray(applications)) {
    return applications.filter(app => app.module === moduleId || (moduleId === 'hse_free' && app.id === 'hse'));
  }
  return [];
};