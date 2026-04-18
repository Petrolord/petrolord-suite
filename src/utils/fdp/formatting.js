/**
 * FDP Formatting Utilities
 * standardized formatting for currency, units, dates, and large numbers
 */

export const formatCurrency = (value, currency = 'USD', compact = false) => {
  if (value === undefined || value === null) return '-';
  
  if (typeof Intl === 'undefined') {
    return `${currency} ${value.toFixed(2)}`;
  }

  const options = {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  };

  if (compact) {
    options.notation = 'compact';
    options.compactDisplay = 'short';
  }

  return new Intl.NumberFormat('en-US', options).format(value);
};

export const formatNumber = (value, decimals = 2) => {
  if (value === undefined || value === null) return '-';
  
  if (typeof Intl === 'undefined') {
    return value.toFixed(decimals);
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';

  if (typeof Intl === 'undefined') {
    return date.toDateString();
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatUnit = (value, unit) => {
  if (value === undefined || value === null) return '-';
  return `${formatNumber(value)} ${unit}`;
};