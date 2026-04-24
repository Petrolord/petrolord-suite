export const getLogColor = (mnemonic) => {
  const colors = {
    'GR': '#4CAF50',
    'RES_DEEP': '#F44336',
    'NPHI': '#2196F3',
    'RHOB': '#FF9800',
    'UNKNOWN': '#000000'
  };
  return colors[mnemonic] || colors['UNKNOWN'];
};