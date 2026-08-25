export const INTEGRATION_TOOLS = [
    { id: 'geomech', name: '1D Geomechanics', type: 'Internal', description: 'Export stress profiles for detailed stability analysis.' },
    { id: 'wellplan', name: 'Well Design Studio', type: 'Internal', description: 'Sync MW windows for casing design.' },
    { id: 'drillhyd', name: 'Drilling Hydraulics', type: 'Internal', description: 'Export PP/FG for ECD management.' },
    { id: 'reservoir', name: 'Reservoir Engineering', type: 'External (API)', description: 'Push pressure data to reservoir models.' },
    { id: 'seismic', name: 'Seismic Interpretation', type: 'External (File)', description: 'Export velocity-pressure cubes.' }
];

export const testIntegrationConnection = async (toolId) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return Math.random() > 0.1; // 90% success rate mock
};

export const exportToTool = async (toolId, data) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`Exported data to ${toolId}:`, data);
    return true;
};