// The display unit system of Fluid Systems Studio, for every card and input
// (FLUID-U1, PL3). Without a provider a component shows oilfield units, the
// units the engine and the saved project hold.
import React, { createContext, useContext, useMemo } from 'react';
import { fluidUnits } from '@/utils/fluidstudio/units';

const OILFIELD = fluidUnits('oilfield');
const FluidUnitsContext = createContext(OILFIELD);

export function FluidUnitsProvider({ system, children }) {
  const value = useMemo(() => fluidUnits(system), [system]);
  return <FluidUnitsContext.Provider value={value}>{children}</FluidUnitsContext.Provider>;
}

export const useFluidUnits = () => useContext(FluidUnitsContext);
