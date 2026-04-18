import { useContext } from 'react';
import { MaterialBalanceContext } from '@/contexts/MaterialBalanceContext';

export const useMaterialBalance = () => {
  const context = useContext(MaterialBalanceContext);
  if (!context) {
    throw new Error("useMaterialBalance must be used within a MaterialBalanceProvider");
  }
  return context;
};