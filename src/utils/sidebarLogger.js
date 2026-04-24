const LOG_PREFIX = '[SidebarSystem]';
const isDev = import.meta.env.DEV;

export const logSidebarEvent = (event, details = {}) => {
  if (isDev) {
    // console.log(`${LOG_PREFIX} ${event}`, details);
  }
};

export const logError = (error, context) => {
  console.error(`${LOG_PREFIX} Error in ${context}:`, error);
};