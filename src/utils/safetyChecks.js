/**
 * Safety checks to ensure the UI remains stable during mode transitions
 */

const isDev = import.meta.env.DEV;

export const validateLayoutStructure = () => {
  if (typeof document === 'undefined') return { sidebarExists: false, mainExists: false, isValid: true };
  
  const sidebarContainer = document.querySelector('[data-testid="sidebar-container"]');
  const mainContent = document.querySelector('main');
  
  return {
    sidebarExists: !!sidebarContainer,
    mainExists: !!mainContent,
    isValid: !!mainContent
  };
};

export const logSafetyStatus = (componentName, status) => {
  if (isDev) {
    // console.log(`[SafetyCheck] ${componentName}:`, status);
  }
};