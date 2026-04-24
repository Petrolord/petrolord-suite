/**
 * Pure JavaScript Memoization Utilities
 */

const isDev = import.meta.env.DEV;

export const memoizeSimple = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = args[0];
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};

export const memoizeWithLimit = (fn, limit = 100) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    
    const result = fn(...args);
    
    if (cache.size >= limit) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    cache.set(key, result);
    return result;
  };
};

export const withPerformanceTracking = (fn, label = 'Operation') => {
  return (...args) => {
    const start = performance.now();
    try {
      return fn(...args);
    } finally {
      const end = performance.now();
      if (isDev && (end - start) > 10) {
        console.debug(`[Perf] ${label} took ${(end - start).toFixed(2)}ms`);
      }
    }
  };
};