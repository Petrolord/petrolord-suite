import React, { useState, useEffect } from 'react';
import { RiskRegisterShell } from './risk-register/components/RiskRegisterShell';
import RiskRegisterDashboardPage from './risk-register/RiskRegisterDashboardPage';
import RiskRegisterTablePage from './risk-register/RiskRegisterTablePage';
import RiskHeatmapPage from './risk-register/RiskHeatmapPage';
import RiskReportsPage from './risk-register/RiskReportsPage';
import { AdvancedReportingStudio } from './risk-register/components/AdvancedReportingStudio';
import { RiskReportingProvider, useRiskReporting } from './risk-register/contexts/RiskReportingContext';

// Inner component to consume context for routing overrides
const RiskRegisterRouter = ({ activeTab, setActiveTab }) => {
  const { activeReport, builderMode } = useRiskReporting();

  // Auto-switch to advanced-reports tab if a report is opened or builder is launched
  useEffect(() => {
    if (activeReport && activeTab !== 'advanced-reports') {
      setActiveTab('advanced-reports');
    }
  }, [activeReport, activeTab, setActiveTab]);

  return (
    <div className="animate-in fade-in duration-300 h-full w-full">
      {activeTab === 'dashboard' && <RiskRegisterDashboardPage setActiveTab={setActiveTab} />}
      {activeTab === 'register' && <RiskRegisterTablePage />}
      {activeTab === 'heatmap' && <RiskHeatmapPage setActiveTab={setActiveTab} />}
      {activeTab === 'reports' && <RiskReportsPage />}
      {activeTab === 'advanced-reports' && <AdvancedReportingStudio />}
    </div>
  );
};

const RiskRegister = () => {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('riskRegisterActiveTab') || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('riskRegisterActiveTab', activeTab);
  }, [activeTab]);

  return (
    <RiskReportingProvider>
      <RiskRegisterShell activeTab={activeTab} onTabChange={setActiveTab}>
        <RiskRegisterRouter activeTab={activeTab} setActiveTab={setActiveTab} />
      </RiskRegisterShell>
    </RiskReportingProvider>
  );
};

export default RiskRegister;