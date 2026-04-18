/**
 * MaterialBalanceContext
 * 
 * Exports:
 * - MaterialBalanceContext: The raw React context.
 * - MaterialBalanceProvider: The provider component to wrap around parts of the app.
 * - useMaterialBalance: A custom hook to consume the context.
 *
 * Usage:
 * import { MaterialBalanceProvider, useMaterialBalance } from '@/contexts/MaterialBalanceContext';
 * 
 * const { pvtData, runForecast } = useMaterialBalance();
 */

import React, { createContext, useState, useCallback, useContext } from 'react';

export const MaterialBalanceContext = createContext(null);

export const useMaterialBalance = () => {
  const context = useContext(MaterialBalanceContext);
  if (!context) {
    throw new Error('useMaterialBalance must be used within a MaterialBalanceProvider');
  }
  return context;
};

export const MaterialBalanceProvider = ({ children }) => {
  // Reservoir Metadata
  const [reservoirMetadata, setReservoirMetadata] = useState({
    name: 'Reservoir Alpha',
    type: 'oil',
    driveType: 'depletion',
    area: 1500,
    thickness: 75,
    phi: 0.22,
    Swi: 0.25,
    cf: 3e-6,
    cw: 3e-6,
    GOC0: 5000,
    OWC0: 5500,
    datum: 5200
  });

  // PVT Data (Array of objects: [{pressure, Rs, Bo, Bg, oil_viscosity}])
  const [pvtData, setPvtData] = useState([]);
  
  // Historical Contact Data
  const [contactObservations, setContactObservations] = useState({
    dates: ['2020-01-01', '2021-01-01'],
    measuredGOC: [5000, 5010],
    measuredOWC: [5500, 5490],
    method: ['Log', 'Log']
  });
  
  // Forecast Results
  const [forecastData, setForecastData] = useState(null);

  // Project Management State
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [currentProject, setCurrentProject] = useState({ id: '1', name: 'Default Project' });
  const [projectList, setProjectList] = useState([
    { id: '1', name: 'Default Project', lastModifiedDate: new Date() }
  ]);

  const updateReservoirMetadata = useCallback((data) => {
    setReservoirMetadata(prev => ({ ...prev, ...data }));
    setHasChanges(true);
  }, []);

  const updatePvtData = useCallback((data) => {
    setPvtData(data);
    setHasChanges(true);
  }, []);

  const saveProject = useCallback(() => {
    setIsSaving(true);
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      setHasChanges(false);
      setLastSavedTime(new Date());
    }, 1000);
  }, []);

  const loadProjectAction = useCallback(async (id) => {
    const project = projectList.find(p => p.id === id);
    if (project) {
      setCurrentProject(project);
      setHasChanges(false);
    }
  }, [projectList]);

  const createProject = useCallback(async (name) => {
    const newProject = {
      id: crypto.randomUUID(),
      name,
      lastModifiedDate: new Date()
    };
    setProjectList(prev => [...prev, newProject]);
    setCurrentProject(newProject);
    setHasChanges(false);
  }, []);

  const deleteProject = useCallback(async (id) => {
    setProjectList(prev => prev.filter(p => p.id !== id));
    if (currentProject.id === id) {
      setCurrentProject(null);
    }
  }, [currentProject]);

  const runForecast = useCallback((schedule) => {
    // Mock forecast generation based on schedule
    const mockProduction = [];
    let currentRate = schedule.initialRate;
    let cumOil = 0;
    const mockPressure = [];
    let currentPressure = 4500;

    for (let i = 0; i <= schedule.years; i++) {
      mockProduction.push({
        date: `Year ${i}`,
        qo: currentRate,
        Np: cumOil / 1e6
      });
      mockPressure.push({
        date: `Year ${i}`,
        pressure: currentPressure
      });

      cumOil += currentRate * 365;
      currentRate = currentRate * Math.pow(1 - schedule.decline, 1);
      currentPressure -= 150;
    }

    setForecastData({ production: mockProduction, pressure: mockPressure });
  }, []);

  return (
    <MaterialBalanceContext.Provider value={{
      reservoirMetadata, 
      updateReservoirMetadata,
      pvtData, 
      setPvtData: updatePvtData,
      contactObservations, 
      setContactObservations,
      forecastData, 
      setForecastData,
      runForecast,
      isSaving, 
      hasChanges, 
      lastSavedTime, 
      saveProject,
      currentProject, 
      setCurrentProject, 
      projectList,
      loadProjectAction,
      createProject,
      deleteProject
    }}>
      {children}
    </MaterialBalanceContext.Provider>
  );
};