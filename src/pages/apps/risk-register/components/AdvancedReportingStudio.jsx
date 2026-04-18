import React from 'react';
import { useRiskReporting } from '../contexts/RiskReportingContext';
import { ReportBuilder } from './reports/ReportBuilder';
import { ReportViewer } from './reports/ReportViewer';

export const AdvancedReportingStudio = () => {
  const { activeReport, builderMode } = useRiskReporting();

  // The studio acts as a container determining whether we show the Builder or the Viewer
  // If nothing is active, the tab shouldn't technically be selected, but if it is, default to builder.
  
  if (activeReport && !builderMode) {
    return <div className="p-6 h-full"><ReportViewer /></div>;
  }

  return (
    <div className="h-full">
      <ReportBuilder />
    </div>
  );
};