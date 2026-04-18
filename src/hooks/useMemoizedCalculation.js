import { useMemo } from 'react';

const isDev = import.meta.env.DEV;

export const useMemoizedCalculation = (factory, deps) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const start = performance.now();
    const result = factory();
    const end = performance.now();
    
    if (isDev && (end - start) > 10) {
      console.debug(`[useMemoizedCalculation] Calculation took ${(end - start).toFixed(2)}ms`);
    }
    
    return result;
  }, deps);
};