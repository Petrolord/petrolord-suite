import { useCallback } from 'react';

/**
 * Custom hook for memoizing callbacks.
 * Replaces the invalid usage of useCallback in utility files.
 * 
 * @param {Function} callback - The callback function
 * @param {Array} deps - Dependency array
 * @returns {Function} The memoized callback
 */
export const useMemoizedCallback = (callback, deps) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((...args) => {
    try {
      return callback(...args);
    } catch (error) {
      console.error('[useMemoizedCallback] Error in callback:', error);
      throw error;
    }
  }, deps);
};