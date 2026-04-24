import { useState, useCallback } from 'react';

export const useRiskReporting = () => {
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const openReport = useCallback((data = {}) => {
    setReportData(data);
    setError(null);
  }, []);

  const closeReport = useCallback(() => {
    setReportData(null);
    setError(null);
  }, []);

  return {
    reportData,
    isLoading,
    error,
    closeReport,
    openReport,
    setReportData,
    setIsLoading,
    setError
  };
};