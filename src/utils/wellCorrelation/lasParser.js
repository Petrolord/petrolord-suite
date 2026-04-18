export const parseLAS = async (file) => {
  // Mock parser for tests
  if (file.name === 'bad.las') throw new Error('No data section');
  
  return {
    metadata: {
      name: 'TEST WELL 1',
      startDepth: 1000,
      stopDepth: 1010,
      step: 0.5,
      depthUnit: 'M',
      field: 'TEST FIELD',
      country: 'USA',
      operator: 'COMPANY'
    },
    curves: [
      { mnemonic: 'DEPT', unit: 'M', data: [1000, 1000.5, 1001, 1001.5] },
      { mnemonic: 'GR', unit: 'GAPI', data: [50.5, 52.1, 55.3, NaN] },
      { mnemonic: 'RHOB', unit: 'G/C3', data: [2.45, 2.44, 2.46, 2.48] }
    ]
  };
};