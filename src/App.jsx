
import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/contexts/SupabaseAuthContext';
import { ReservoirProvider } from '@/contexts/ReservoirContext';
import { HSEProvider } from '@/contexts/HSEContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import OnboardingRoute from '@/components/OnboardingRoute';
import SuperAdminRoute from '@/components/SuperAdminRoute';
import AuthGuard from '@/components/AuthGuard';
import AppRoute from '@/components/AppRoute';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Toaster } from '@/components/ui/sonner';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AdminOrgProvider } from '@/contexts/AdminOrganizationContext';
import ProtectedAppRoute from '@/components/ProtectedAppRoute';
import { runAccessDiagnostics } from '@/utils/debugAccess';
import { SUITE_PERMISSIONS, HSE_PERMISSIONS } from '@/constants/permissions';

// Eager loaded components
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ForgotPassword from '@/pages/ForgotPassword';
import SetPassword from '@/pages/SetPassword';
import Dashboard from '@/pages/Dashboard';
import PaymentVerification from '@/pages/PaymentVerification';
import AcceptInvite from '@/pages/auth/AcceptInvite';
import ConfirmationPage from '@/pages/auth/ConfirmationPage';

// Lazy loaded Module Hubs
const DrillingCompletionsHub = lazy(() => import('@/pages/dashboard/DrillingCompletionsHub'));
const ProductionOperationsHub = lazy(() => import('@/pages/dashboard/ProductionOperationsHub'));
const EconomicsProjectManagementHub = lazy(() => import('@/pages/dashboard/EconomicsProjectManagementHub'));
const FacilitiesEngineeringHub = lazy(() => import('@/pages/dashboard/FacilitiesEngineeringHub'));
const MidstreamDownstreamHub = lazy(() => import('@/pages/dashboard/MidstreamDownstreamHub'));
const GeoscienceAnalytics = lazy(() => import('@/pages/dashboard/GeoscienceAnalytics'));
const ReservoirManagement = lazy(() => import('@/pages/dashboard/ReservoirManagement'));
const Assurance = lazy(() => import('@/pages/dashboard/Assurance'));

// Super Admin Console
const SuperAdminConsole = lazy(() => import('@/pages/SuperAdminConsole'));

// Apps - Lazy Loaded
// NOTE: the legacy `apps/geoscience/quickvol` slug is intentionally kept as an
// alias that renders ReservoirCalcPro (the QuickVol page was retired — it was an
// unrendered, mostly-mocked duplicate). Existing links/bookmarks keep working.
const ReservoirCalcPro = lazy(() => import('@/pages/apps/ReservoirCalcPro/ReservoirCalcPro'));
const WellSpacingOptimizer = lazy(() => import('@/pages/apps/WellSpacingOptimizer'));
const NpvScenarioBuilder = lazy(() => import('@/pages/apps/NpvScenarioBuilder'));
const DecisionTreeBuilder = lazy(() => import('@/pages/apps/DecisionTreeBuilder'));
const DecisionStudio = lazy(() => import('@/pages/apps/DecisionStudio'));
const ValueOfInformationAnalyzer = lazy(() => import('@/pages/apps/ValueOfInformationAnalyzer'));
const ProbabilisticBreakevenAnalyzer = lazy(() => import('@/pages/apps/ProbabilisticBreakevenAnalyzer'));
const FdpAccelerator = lazy(() => import('@/pages/apps/FDPAccelerator'));
const ProjectManagementPro = lazy(() => import('@/pages/apps/ProjectManagementPro'));
const TechnicalReportAutopilot = lazy(() => import('@/pages/apps/TechnicalReportAutopilot'));
const WellCorrelation = lazy(() => import('@/pages/apps/WellCorrelation/WellCorrelation'));
const PetrophysicsStudio = lazy(() => import('@/pages/apps/PetrophysicsStudio/PetrophysicsStudio'));
const ContourMapDigitizer = lazy(() => import('@/pages/apps/ContourMapDigitizer'));
const WellPlanning = lazy(() => import('@/pages/apps/WellPlanning'));
const ReliefBlowdownSizer = lazy(() => import('@/pages/apps/ReliefBlowdownSizer'));
const FacilityLayoutMapper = lazy(() => import('@/pages/apps/FacilityLayoutMapper'));
const PipelineLineSizingStudio = lazy(() => import('@/pages/apps/PipelineLineSizingStudio'));
const SeparatorSlugCatcherDesigner = lazy(() => import('@/pages/apps/SeparatorSlugCatcherDesigner'));
const CompressorStationDesigner = lazy(() => import('@/pages/apps/CompressorStationDesigner'));
const PumpStationDesigner = lazy(() => import('@/pages/apps/PumpStationDesigner'));
const ControlValveSizing = lazy(() => import('@/pages/apps/ControlValveSizing'));
const StorageTankDesigner = lazy(() => import('@/pages/apps/StorageTankDesigner'));
const CrudeAssayBlendingStudio = lazy(() => import('@/pages/apps/CrudeAssayBlendingStudio'));
const ProductBlendingOptimizer = lazy(() => import('@/pages/apps/ProductBlendingOptimizer'));
const RefineryPlanningStudio = lazy(() => import('@/pages/apps/RefineryPlanningStudio'));
const FlowMeteringDesigner = lazy(() => import('@/pages/apps/FlowMeteringDesigner'));
const HeatExchangerSizer = lazy(() => import('@/pages/apps/HeatExchangerSizer'));
const GasTreatingDehydration = lazy(() => import('@/pages/apps/GasTreatingDehydration'));
const CorrosionRatePredictor = lazy(() => import('@/pages/apps/CorrosionRatePredictor'));
const AfeCostControlManager = lazy(() => import('@/pages/apps/AfeCostControlManager'));
const CapitalPortfolioStudio = lazy(() => import('@/pages/apps/CapitalPortfolioStudio'));
const FiscalRegimeDesigner = lazy(() => import('@/pages/apps/FiscalRegimeDesigner'));
const VoidageReplacementMonitor = lazy(() => import('@/pages/apps/VoidageReplacementMonitor'));
const WaterfloodDesignStudio = lazy(() => import('@/pages/apps/WaterfloodDesignStudio'));
const ScalStudio = lazy(() => import('@/pages/apps/ScalStudio'));
const ReservoirSimulationStudio = lazy(() => import('@/pages/apps/ReservoirSimulationStudio'));
const RecoveryFactorEstimator = lazy(() => import('@/pages/apps/RecoveryFactorEstimator'));
const RiskedReservesValuation = lazy(() => import('@/pages/apps/RiskedReservesValuation'));
const EorScreeningTool = lazy(() => import('@/pages/apps/EorScreeningTool'));
const ForecastScenarioHub = lazy(() => import('@/pages/apps/ForecastScenarioHub'));
const DeclineCurveAnalysis = lazy(() => import('@/pages/apps/DeclineCurveAnalysis'));
const FluidSystemsStudio = lazy(() => import('@/pages/apps/FluidSystemsStudio'));
const ReservoirBalance = lazy(() => import('@/pages/apps/reservoir-balance/ReservoirBalance'));
const ArtificialLiftAdvisor = lazy(() => import('@/pages/apps/ArtificialLiftAdvisor'));
const PorePressureStudio = lazy(() => import('@/pages/apps/PorePressureStudio/PorePressureStudio'));
const BasinFlowGenesis = lazy(() => import('@/pages/apps/BasinFlowGenesis/BasinFlowGenesis'));
const Seismolord = lazy(() => import('@/pages/apps/Seismolord/Seismolord'));
const SeismolordSelfTest = lazy(() => import('@/pages/apps/Seismolord/SeismolordSelfTest'));
const SeismolordSliceViewHarness = lazy(() => import('@/pages/apps/Seismolord/SeismolordSliceViewHarness'));
const SeismolordWellsHarness = lazy(() => import('@/pages/apps/Seismolord/SeismolordWellsHarness'));
const SeismolordWellTieHarness = lazy(() => import('@/pages/apps/Seismolord/SeismolordWellTieHarness'));
const SeismolordSyntheticsHarness = lazy(() => import('@/pages/apps/Seismolord/SeismolordSyntheticsHarness'));
const SeismolordCubeViewHarness = lazy(() => import('@/pages/apps/Seismolord/SeismolordCubeViewHarness'));
const SeismolordWorkspaceHarness = lazy(() => import('@/pages/apps/Seismolord/SeismolordWorkspaceHarness'));
const WellDataManagerHarness = lazy(() => import('@/pages/apps/WellDataManager/WellDataManagerHarness'));
const PetrophysicsStudioHarness = lazy(() => import('@/pages/apps/PetrophysicsStudio/PetrophysicsStudioHarness'));
const WellCorrelationHarness = lazy(() => import('@/pages/apps/WellCorrelation/WellCorrelationHarness'));
const MappingSurfaceStudioHarness = lazy(() => import('@/pages/apps/MappingSurfaceStudio/MappingSurfaceStudioHarness'));
const ProspectRiskingHarness = lazy(() => import('@/pages/apps/ReservoirCalcPro/ProspectRiskingHarness'));
const RockPhysicsStudioHarness = lazy(() => import('@/pages/apps/RockPhysicsStudio/RockPhysicsStudioHarness'));
const MappingSurfaceStudio = lazy(() => import('@/pages/apps/MappingSurfaceStudio/MappingSurfaceStudio'));
const RockPhysicsStudio = lazy(() => import('@/pages/apps/RockPhysicsStudio/RockPhysicsStudio'));
const EarthModeling = lazy(() => import('@/pages/apps/EarthModeling/EarthModeling'));
const EarthModelingHarness = lazy(() => import('@/pages/apps/EarthModeling/EarthModelingHarness'));
const PorePressureStudioHarness = lazy(() => import('@/pages/apps/PorePressureStudio/PorePressureStudioHarness'));
const WellDesignHarness = lazy(() => import('@/pages/apps/well-planning/WellDesignHarness'));
const TorqueDragStudio = lazy(() => import('@/pages/apps/TorqueDragStudio/TorqueDragStudio'));
const TorqueDragHelpGuide = lazy(() => import('@/pages/apps/TorqueDragStudio/TorqueDragHelpGuide'));
const TorqueDragHarness = lazy(() => import('@/pages/apps/TorqueDragStudio/TorqueDragHarness'));
const HydraulicsStudio = lazy(() => import('@/pages/apps/HydraulicsStudio/HydraulicsStudio'));
const HydraulicsHelpGuide = lazy(() => import('@/pages/apps/HydraulicsStudio/HydraulicsHelpGuide'));
const HydraulicsHarness = lazy(() => import('@/pages/apps/HydraulicsStudio/HydraulicsHarness'));
const WellControlStudio = lazy(() => import('@/pages/apps/WellControlStudio/WellControlStudio'));
const WellControlHelpGuide = lazy(() => import('@/pages/apps/WellControlStudio/WellControlHelpGuide'));
const WellControlHarness = lazy(() => import('@/pages/apps/WellControlStudio/WellControlHarness'));
const CementingStudio = lazy(() => import('@/pages/apps/CementingStudio/CementingStudio'));
const CementingHelpGuide = lazy(() => import('@/pages/apps/CementingStudio/CementingHelpGuide'));
const CementingHarness = lazy(() => import('@/pages/apps/CementingStudio/CementingHarness'));
const GeomechanicsStudio = lazy(() => import('@/pages/apps/GeomechanicsStudio/GeomechanicsStudio'));
const GeomechanicsHelpGuide = lazy(() => import('@/pages/apps/GeomechanicsStudio/GeomechanicsHelpGuide'));
const EorScreeningHelpGuide = lazy(() => import('@/pages/apps/EorScreeningHelpGuide'));
const ForecastScenarioHubHelpGuide = lazy(() => import('@/pages/apps/ForecastScenarioHubHelpGuide'));
const RiskedReservesHelpGuide = lazy(() => import('@/pages/apps/RiskedReservesHelpGuide'));
const WellSpacingHelpGuide = lazy(() => import('@/pages/apps/WellSpacingHelpGuide'));
const GeomechanicsHarness = lazy(() => import('@/pages/apps/GeomechanicsStudio/GeomechanicsHarness'));
const WellDesignHelpGuide = lazy(() => import('@/pages/apps/well-planning/WellDesignHelpGuide'));
const WellDataManager = lazy(() => import('@/pages/apps/WellDataManager/WellDataManager'));
const AnalogFinder = lazy(() => import('@/pages/apps/AnalogFinder'));
const WellTestAnalysisStudio = lazy(() => import('@/pages/apps/WellTestAnalysisStudio'));
const NodalAnalysisStudio = lazy(() => import('@/pages/apps/NodalAnalysisStudio'));
const ProductionSurveillanceStudio = lazy(() => import('@/pages/apps/ProductionSurveillanceStudio'));
const ProductionAllocationStudio = lazy(() => import('@/pages/apps/ProductionAllocationStudio'));
const GasLiftDesignStudio = lazy(() => import('@/pages/apps/GasLiftDesignStudio'));
const EspDesignStudio = lazy(() => import('@/pages/apps/EspDesignStudio'));
const RodPumpDesignStudio = lazy(() => import('@/pages/apps/RodPumpDesignStudio'));
const GasWellPerformanceStudio = lazy(() => import('@/pages/apps/GasWellPerformanceStudio'));
const ChokePerformanceStudio = lazy(() => import('@/pages/apps/ChokePerformanceStudio'));
const FlowAssuranceStudio = lazy(() => import('@/pages/apps/FlowAssuranceStudio'));
const ProductionNetworkStudio = lazy(() => import('@/pages/apps/ProductionNetworkStudio'));
const WellInterventionPlanner = lazy(() => import('@/pages/apps/WellInterventionPlanner'));
const GeoscienceHub = lazy(() => import('@/pages/apps/GeoscienceHub'));
const CasingTubingDesignPro = lazy(() => import('@/pages/apps/CasingTubingDesignPro/CasingTubingDesignPro'));
const CasingTubingHelpGuide = lazy(() => import('@/pages/apps/CasingTubingDesignPro/CasingTubingHelpGuide'));
const CasingTubingHarness = lazy(() => import('@/pages/apps/CasingTubingDesignPro/CasingTubingHarness'));
const CompletionDesignStudio = lazy(() => import('@/pages/apps/CompletionDesignStudio/CompletionDesignStudio'));
const CompletionDesignHelpGuide = lazy(() => import('@/pages/apps/CompletionDesignStudio/CompletionDesignHelpGuide'));
const CompletionDesignHarness = lazy(() => import('@/pages/apps/CompletionDesignStudio/CompletionDesignHarness'));
const PerforationSandControlStudio = lazy(() => import('@/pages/apps/PerforationSandControl/PerforationSandControlStudio'));
const PerforationSandControlHelpGuide = lazy(() => import('@/pages/apps/PerforationSandControl/PerforationSandControlHelpGuide'));
const PerforationSandControlHarness = lazy(() => import('@/pages/apps/PerforationSandControl/PerforationSandControlHarness'));
const StimulationDesignerStudio = lazy(() => import('@/pages/apps/StimulationDesigner/StimulationDesignerStudio'));
const StimulationDesignerHelpGuide = lazy(() => import('@/pages/apps/StimulationDesigner/StimulationDesignerHelpGuide'));
const StimulationDesignerHarness = lazy(() => import('@/pages/apps/StimulationDesigner/StimulationDesignerHarness'));
const WellIntegrityPAStudio = lazy(() => import('@/pages/apps/WellIntegrityPA/WellIntegrityPAStudio'));
const WellIntegrityPAHelpGuide = lazy(() => import('@/pages/apps/WellIntegrityPA/WellIntegrityPAHelpGuide'));
const WellIntegrityPAHarness = lazy(() => import('@/pages/apps/WellIntegrityPA/WellIntegrityPAHarness'));
const WellCostTimeStudio = lazy(() => import('@/pages/apps/WellCostTime/WellCostTimeStudio'));
const WellCostTimeHelpGuide = lazy(() => import('@/pages/apps/WellCostTime/WellCostTimeHelpGuide'));
const WellCostTimeHarness = lazy(() => import('@/pages/apps/WellCostTime/WellCostTimeHarness'));

// Facilities newly added ones
const ProducedWaterTreatment = lazy(() => import('@/pages/apps/ProducedWaterTreatment.jsx'));

// Assurance
const RiskRegister = lazy(() => import('@/pages/apps/RiskRegister.jsx'));

// Risk Register Consolidated Flow
const NewRiskPage = lazy(() => import('@/pages/apps/risk-register/NewRiskPage.jsx'));
const RiskDetailPage = lazy(() => import('@/pages/apps/risk-register/RiskDetailPage.jsx'));

// Document Control
const DocControlDashboard = lazy(() => import('@/pages/apps/document-control/Dashboard.jsx'));
const DocControlLibrary = lazy(() => import('@/pages/apps/document-control/Library.jsx'));
const DocControlNew = lazy(() => import('@/pages/apps/document-control/NewDocument.jsx'));
const DocControlApprovals = lazy(() => import('@/pages/apps/document-control/ApprovalQueue.jsx'));
const DocControlReports = lazy(() => import('@/pages/apps/document-control/Reports.jsx'));
const DocControlDetail = lazy(() => import('@/pages/apps/document-control/DocumentDetail.jsx'));

// Peer Review Manager
const PeerReviewDashboard = lazy(() => import('@/pages/apps/peer-review/Dashboard.jsx'));
const PeerReviewRegister = lazy(() => import('@/pages/apps/peer-review/ReviewRegister.jsx'));
const PeerReviewNew = lazy(() => import('@/pages/apps/peer-review/NewReview.jsx'));
const PeerReviewReports = lazy(() => import('@/pages/apps/peer-review/Reports.jsx'));
const PeerReviewDetail = lazy(() => import('@/pages/apps/peer-review/ReviewDetail.jsx'));

// Management of Change (MOC)
const MOCDashboard = lazy(() => import('@/pages/apps/assurance/moc/Dashboard.jsx'));
const MOCRegister = lazy(() => import('@/pages/apps/assurance/moc/Register.jsx'));
const MOCNew = lazy(() => import('@/pages/apps/assurance/moc/NewMOC.jsx'));
const MOCApprovals = lazy(() => import('@/pages/apps/assurance/moc/Approvals.jsx'));
const MOCReports = lazy(() => import('@/pages/apps/assurance/moc/Reports.jsx'));
const MOCDetail = lazy(() => import('@/pages/apps/assurance/moc/MOCDetail.jsx'));

// Quality Assurance Plan (QA Plan) Shell
const QAPlanPageShell = lazy(() => import('@/pages/apps/assurance/qa-plan/QAPlanPageShell.jsx'));

// Regulatory Compliance Shell
const RegulatoryCompliancePageShell = lazy(() => import('@/pages/apps/assurance/regulatory-compliance/RegulatoryCompliancePageShell.jsx'));

// ISO Compliance Shell
const ISOCompliancePageShell = lazy(() => import('@/pages/apps/assurance/iso-compliance/ISOCompliancePageShell'));

// Lessons Learned Shell
const LessonsLearnedPageShell = lazy(() => import('@/pages/apps/assurance/lessons-learned/LessonsLearnedPageShell.jsx'));

// Petroleum Economics Studio Components

const EpeCaseList = lazy(() => import('@/pages/apps/epe/EpeCaseList'));
const EpeHelpGuide = lazy(() => import('@/pages/apps/epe/EpeHelpGuide'));
const EpeCaseDetail = lazy(() => import('@/pages/apps/epe/EpeCaseDetail'));
const EpeRunConsole = lazy(() => import('@/pages/apps/epe/EpeRunConsole'));
const EpeResultsViewer = lazy(() => import('@/pages/apps/epe/EpeResultsViewer'));
const EpeRunComparison = lazy(() => import('@/pages/apps/epe/EpeRunComparison'));

const MobileLayout = lazy(() => import('@/layouts/MobileLayout'));
const MobileDashboard = lazy(() => import('@/pages/mobile/MobileDashboard'));
const MobileProjectList = lazy(() => import('@/pages/mobile/MobileProjectList'));
const MobileTasks = lazy(() => import('@/pages/mobile/MobileTasks'));
const MobileNotifications = lazy(() => import('@/pages/mobile/MobileNotifications'));
const MobileProfile = lazy(() => import('@/pages/mobile/MobileProfile'));
const QuoteDashboard = lazy(() => import('@/pages/QuoteDashboard'));
const GetQuote = lazy(() => import('@/pages/GetQuote'));
const Profile = lazy(() => import('@/pages/Profile'));
const AdminCreateUser = lazy(() => import('@/pages/AdminCreateUser'));
const AdminOrganizations = lazy(() => import('@/pages/admin/AdminOrganizations'));
const OrgDetail = lazy(() => import('@/pages/admin/OrgDetail'));
const OrgEdit = lazy(() => import('@/pages/admin/OrgEdit'));
const OrgSendQuote = lazy(() => import('@/pages/admin/OrgSendQuote'));
const SystemHealth = lazy(() => import('@/pages/admin/SystemHealth'));
const AdminCenter = lazy(() => import('@/pages/admin/AdminCenter'));
const TermsOfService = lazy(() => import('@/pages/legal/TermsOfService'));
const PrivacyPolicy = lazy(() => import('@/pages/legal/PrivacyPolicy'));
const DataRetention = lazy(() => import('@/pages/legal/DataRetention'));
const DataProcessingAgreement = lazy(() => import('@/pages/legal/DataProcessingAgreement'));
const VerifyDeletion = lazy(() => import('@/pages/legal/VerifyDeletion'));
const Support = lazy(() => import('@/pages/legal/Support'));
const Documentation = lazy(() => import('@/pages/legal/Documentation'));
const AboutUs = lazy(() => import('@/pages/company/AboutUs'));
const Careers = lazy(() => import('@/pages/company/Careers'));
const Solutions = lazy(() => import('@/pages/Solutions'));
const Resources = lazy(() => import('@/pages/Resources'));
const NextGen = lazy(() => import('@/pages/NextGen'));
const QuoteBuilder = lazy(() => import('@/pages/QuoteBuilder'));
const ModuleAccess = lazy(() => import('@/pages/ModuleAccess'));
const SeatManagement = lazy(() => import('@/pages/SeatManagement'));
const EmployeeManagement = lazy(() => import('@/pages/EmployeeManagement'));
const DataExport = lazy(() => import('@/pages/DataExport'));
const AccessRequests = lazy(() => import('@/pages/admin/AccessRequests'));
const SubscriptionManagement = lazy(() => import('@/pages/SubscriptionManagement'));
const RenewSubscription = lazy(() => import('@/pages/RenewSubscription'));
const SubscriptionUsageAnalytics = lazy(() => import('@/pages/SubscriptionUsageAnalytics'));
const SubscriptionHistory = lazy(() => import('@/pages/SubscriptionHistory'));
const AuditLogs = lazy(() => import('@/pages/admin/AuditLogs'));
const TeamManagement = lazy(() => import('@/pages/admin/TeamManagement'));
const BulkImportEmployees = lazy(() => import('@/pages/admin/BulkImportEmployees'));
const AppAnalyticsDashboard = lazy(() => import('@/pages/admin/AppAnalyticsDashboard'));
const AdminSeedApps = lazy(() => import('@/pages/admin/AdminSeedApps')); 
const MasterAppsViewer = lazy(() => import('@/pages/admin/MasterAppsViewer'));
const PromoCodes = lazy(() => import('@/pages/admin/PromoCodes'));

// Loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center h-full w-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))] min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[hsl(var(--primary))]"></div>
  </div>
);

const ExternalRedirect = ({ url }) => {
  React.useEffect(() => {
    window.location.href = url;
  }, [url]);
  return <PageLoader />;
};

function App() {
  const location = useLocation();
  const isDashboard = location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/mobile');

  useEffect(() => {
    window.runAccessDiagnostics = runAccessDiagnostics;
  }, []);

  return (
    <AuthProvider>
      <HSEProvider> 
          <AuthGuard>
            <ErrorBoundary>
              <ReservoirProvider>
                    <AdminOrgProvider>
                      <div className={`${isDashboard ? "h-screen overflow-hidden" : "min-h-screen overflow-y-auto"} w-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))]`}>
                          <Suspense fallback={<PageLoader />}>
                            <Routes>
                              <Route path="/" element={<Home />} />
                              <Route path="/login" element={<Login />} />
                              <Route path="/signup" element={<Signup />} />
                              <Route path="/auth/confirm" element={<ConfirmationPage />} />
                              <Route path="/forgot-password" element={<ForgotPassword />} />
                              <Route path="/auth/reset-password" element={<SetPassword />} />
                              <Route path="/set-password" element={<SetPassword />} />
                              
                              <Route path="/auth/accept-invite" element={<AcceptInvite />} />
                              <Route path="/payment/verify" element={<PaymentVerification />} />

                              <Route path="/super-admin" element={
                                <ProtectedRoute requiredRole="super_admin">
                                  <SuperAdminConsole />
                                </ProtectedRoute>
                              } />

                              <Route path="/admin-create-user" element={
                                <SuperAdminRoute>
                                  <AdminCreateUser />
                                </SuperAdminRoute>
                              } />
                              <Route path="/admin/organizations" element={
                                <SuperAdminRoute>
                                  <AdminOrganizations />
                                </SuperAdminRoute>
                              } />
                              <Route path="/admin/organizations/:orgId" element={
                                <SuperAdminRoute>
                                  <OrgDetail />
                                </SuperAdminRoute>
                              } />
                              <Route path="/admin/organizations/:orgId/edit" element={
                                <SuperAdminRoute>
                                  <OrgEdit />
                                </SuperAdminRoute>
                              } />
                              <Route path="/admin/organizations/:orgId/send-quote" element={
                                <SuperAdminRoute>
                                  <OrgSendQuote />
                                </SuperAdminRoute>
                              } />
                              <Route path="/admin/system-health" element={
                                <SuperAdminRoute>
                                  <SystemHealth />
                                </SuperAdminRoute>
                              } />
                              <Route path="/admin/center" element={
                                <SuperAdminRoute>
                                  <AdminCenter />
                                </SuperAdminRoute>
                              } />
                              <Route path="/admin/seed-apps" element={
                                <SuperAdminRoute>
                                  <AdminSeedApps />
                                </SuperAdminRoute>
                              } />
                              <Route path="/admin/master-apps-viewer" element={
                                <SuperAdminRoute>
                                  <MasterAppsViewer />
                                </SuperAdminRoute>
                              } />
                              <Route path="/admin/promo-codes" element={
                                <SuperAdminRoute>
                                  <PromoCodes />
                                </SuperAdminRoute>
                              } />
                              
                              <Route path="/mobile" element={
                                <ProtectedRoute>
                                  <MobileLayout />
                                </ProtectedRoute>
                              }>
                                <Route index element={<Navigate to="dashboard" replace />} />
                                <Route path="dashboard" element={<MobileDashboard />} />
                                <Route path="projects" element={<MobileProjectList />} />
                                <Route path="tasks" element={<MobileTasks />} />
                                <Route path="notifications" element={<MobileNotifications />} />
                                <Route path="profile" element={<MobileProfile />} />
                              </Route>

                              <Route path="/dashboard" element={
                                <OnboardingRoute>
                                  <ProtectedRoute>
                                    <DashboardLayout />
                                  </ProtectedRoute>
                                </OnboardingRoute>
                              }>
                                <Route index element={<Dashboard />} />
                                <Route path="upgrade" element={<QuoteBuilder />} />
                                <Route path="modules" element={<ModuleAccess />} />
                                <Route path="seats" element={<SeatManagement />} />
                                <Route path="employees" element={<EmployeeManagement />} />
                                <Route path="access-requests" element={<AccessRequests />} />
                                
                                <Route path="data-export" element={
                                  <ProtectedRoute requiredPermission={SUITE_PERMISSIONS.MANAGE_ORGANIZATION}>
                                    <DataExport />
                                  </ProtectedRoute>
                                } />
                                <Route path="audit-logs" element={
                                  <ProtectedRoute requiredPermission={SUITE_PERMISSIONS.MANAGE_ORGANIZATION}>
                                    <AuditLogs />
                                  </ProtectedRoute>
                                } />
                                <Route path="teams" element={
                                  <ProtectedRoute requiredPermission={SUITE_PERMISSIONS.MANAGE_USERS}>
                                    <TeamManagement />
                                  </ProtectedRoute>
                                } />
                                <Route path="bulk-import" element={
                                  <ProtectedRoute requiredPermission={SUITE_PERMISSIONS.MANAGE_USERS}>
                                    <BulkImportEmployees />
                                  </ProtectedRoute>
                                } />
                                <Route path="analytics" element={
                                  <ProtectedRoute requiredPermission={SUITE_PERMISSIONS.VIEW_ANALYTICS}>
                                    <AppAnalyticsDashboard />
                                  </ProtectedRoute>
                                } />

                                <Route path="subscriptions" element={
                                  <ProtectedRoute requiredPermission={SUITE_PERMISSIONS.MANAGE_BILLING}>
                                    <SubscriptionManagement />
                                  </ProtectedRoute>
                                } />
                                <Route path="subscriptions/renew/:moduleId" element={<RenewSubscription />} />
                                <Route path="subscriptions/analytics" element={
                                  <ProtectedRoute requiredPermission={SUITE_PERMISSIONS.VIEW_ANALYTICS}>
                                    <SubscriptionUsageAnalytics />
                                  </ProtectedRoute>
                                } />
                                <Route path="subscriptions/history" element={
                                  <ProtectedRoute requiredPermission={SUITE_PERMISSIONS.MANAGE_BILLING}>
                                    <SubscriptionHistory />
                                  </ProtectedRoute>
                                } />

                                <Route path="quote/:quoteId" element={<QuoteDashboard />} />
                                <Route path="get-quote" element={<GetQuote />} />
                                
                                <Route path="geoscience" element={<AppRoute appName="geoscience"><GeoscienceAnalytics /></AppRoute>} />
                                <Route path="reservoir" element={<AppRoute appName="reservoir"><ReservoirManagement /></AppRoute>} />
                                <Route path="drilling" element={<AppRoute appName="drilling"><DrillingCompletionsHub /></AppRoute>} />
                                <Route path="production" element={<AppRoute appName="production"><ProductionOperationsHub /></AppRoute>} />
                                <Route path="economics" element={<AppRoute appName="economics"><EconomicsProjectManagementHub /></AppRoute>} />
                                <Route path="facilities" element={<AppRoute appName="facilities"><FacilitiesEngineeringHub /></AppRoute>} />
                                {/* DS0: the Suite's eighth module. Its apps are Coming Soon,
                                    so the hub is the only route it owns for now. */}
                                <Route path="midstream-downstream" element={<AppRoute appName="midstream-downstream"><MidstreamDownstreamHub /></AppRoute>} />
                                <Route path="assurance" element={<AppRoute appName="assurance"><Assurance /></AppRoute>} />
                                
                                <Route path="hse" element={
                                  <ProtectedRoute requiredPermission={HSE_PERMISSIONS.VIEW_DASHBOARD} appContext="hse">
                                    <ExternalRedirect url="https://hse.petrolord.com" />
                                  </ProtectedRoute>
                                } />

                                <Route path="geoscience/*" element={<Navigate to="/dashboard/geoscience" replace />} />
                                <Route path="reservoir/*" element={<Navigate to="/dashboard/reservoir" replace />} />
                                <Route path="drilling/*" element={<Navigate to="/dashboard/drilling" replace />} />
                                <Route path="production/*" element={<Navigate to="/dashboard/production" replace />} />
                                <Route path="economics/*" element={<Navigate to="/dashboard/economics" replace />} />
                                <Route path="facilities/*" element={<Navigate to="/dashboard/facilities" replace />} />
                                <Route path="assurance/*" element={<Navigate to="/dashboard/assurance" replace />} />
                                
                                <Route path="apps/geoscience/hub" element={<ProtectedAppRoute appId="geoscience-hub" appName="Geoscience Hub"><GeoscienceHub /></ProtectedAppRoute>} />
                                <Route path="apps/geoscience/quickvol" element={<ProtectedAppRoute appId="reservoircalc-pro" appName="QuickVol"><ReservoirCalcPro /></ProtectedAppRoute>} />
                                <Route path="apps/geoscience/reservoircalc-pro" element={<ProtectedAppRoute appId="reservoircalc-pro" appName="ReservoirCalc Pro"><ReservoirCalcPro /></ProtectedAppRoute>} />
                                {/* Well Correlation (G3) replaces the mock Well Correlation Tool;
                                    the legacy slug redirects to the successor (roadmap G0 alias rule). */}
                                <Route path="apps/geoscience/well-correlation" element={<ProtectedAppRoute appId="well-correlation" appName="Well Correlation"><WellCorrelation /></ProtectedAppRoute>} />
                                <Route path="apps/geoscience/mapping-surface-studio" element={<ProtectedAppRoute appId="mapping-surface-studio" appName="Mapping & Surface Studio"><MappingSurfaceStudio /></ProtectedAppRoute>} />
                                <Route path="apps/geoscience/well-correlation-tool" element={<Navigate to="/dashboard/apps/geoscience/well-correlation" replace />} />
                                
                                {/* Petrophysics Studio (G2) supersedes five shallow tiles;
                                    the old geoscience routes redirect to it so bookmarks
                                    and any in-flight entitlements land on the successor
                                    (roadmap G0: routes stay as aliases where a successor exists). */}
                                <Route path="apps/geoscience/petrophysics-studio" element={<ProtectedAppRoute appId="petrophysics-studio" appName="Petrophysics Studio"><PetrophysicsStudio /></ProtectedAppRoute>} />
                                <Route path="apps/geoscience/rock-physics-studio" element={<ProtectedAppRoute appId="rock-physics-studio" appName="Rock Physics Studio"><RockPhysicsStudio /></ProtectedAppRoute>} />
                                <Route path="apps/geoscience/earth-modeling" element={<ProtectedAppRoute appId="earth-modeling" appName="Earth Modeling"><EarthModeling /></ProtectedAppRoute>} />
                                <Route path="apps/geoscience/pore-pressure-studio" element={<ProtectedAppRoute appId="pore-pressure-studio" appName="Pore Pressure Studio"><PorePressureStudio /></ProtectedAppRoute>} />
                                <Route path="apps/geoscience/crossplot-generator" element={<Navigate to="/dashboard/apps/geoscience/petrophysics-studio" replace />} />
                                <Route path="apps/geoscience/petrophysics-estimator" element={<Navigate to="/dashboard/apps/geoscience/petrophysics-studio" replace />} />
                                <Route path="apps/geoscience/petrophysical-integration-suite" element={<Navigate to="/dashboard/apps/geoscience/petrophysics-studio" replace />} />
                                <Route path="apps/geoscience/log-facies-analysis" element={<Navigate to="/dashboard/apps/geoscience/petrophysics-studio" replace />} />
                                <Route path="apps/geoscience/well-log-analyzer" element={<Navigate to="/dashboard/apps/geoscience/petrophysics-studio" replace />} />
                                <Route path="apps/geoscience/automated-log-digitizer" element={<Navigate to="/dashboard/apps/geoscience/petrophysics-studio" replace />} />
                                <Route path="apps/geoscience/contour-map-digitizer" element={<ContourMapDigitizer />} />
                                <Route path="apps/geoscience/analog-finder" element={<AnalogFinder />} />
                                {/* Legacy earth-model slugs redirect to the G8 successor
                                    (roadmap G0: routes stay as aliases where a successor exists). */}
                                <Route path="apps/geoscience/earthmodel-studio" element={<Navigate to="/dashboard/apps/geoscience/earth-modeling" replace />} />
                                <Route path="apps/geoscience/earth-model-studio" element={<Navigate to="/dashboard/apps/geoscience/earth-modeling" replace />} />
                                <Route path="apps/geoscience/earthmodel-pro" element={<Navigate to="/dashboard/apps/geoscience/earth-modeling" replace />} />
                                <Route path="apps/geoscience/earth-model-pro" element={<Navigate to="/dashboard/apps/geoscience/earth-modeling" replace />} />
                                <Route path="apps/geoscience/earth-model-studio/projects" element={<Navigate to="/dashboard/apps/geoscience/earth-modeling" replace />} />
                                <Route path="apps/geoscience/basinflow-genesis" element={<BasinFlowGenesis />} />
                                <Route path="apps/geoscience/seismolord" element={<ProtectedAppRoute appId="seismolord" appName="Seismolord"><Seismolord /></ProtectedAppRoute>} />
                                <Route path="apps/geoscience/well-data-manager" element={<ProtectedAppRoute appId="well-data-manager" appName="Well Data Manager"><WellDataManager /></ProtectedAppRoute>} />

                                {/* Legacy MEM aliases — the 1D MEM rebuilt under Drilling at D5 (Drilling-ROADMAP.md); the legacy tree is deleted */}
                                <Route path="apps/geoscience/mechanical-earth-model" element={<Navigate to="/dashboard/apps/drilling/geomechanics-studio" replace />} />
                                <Route path="apps/mechanical-earth-model" element={<Navigate to="/dashboard/apps/drilling/geomechanics-studio" replace />} />
                                <Route path="apps/geoscience/1d-mechanical-earth-model" element={<Navigate to="/dashboard/apps/drilling/geomechanics-studio" replace />} />
                                <Route path="apps/1d-mechanical-earth-model" element={<Navigate to="/dashboard/apps/drilling/geomechanics-studio" replace />} />
                                <Route path="apps/geoscience/mem" element={<Navigate to="/dashboard/apps/drilling/geomechanics-studio" replace />} />
                                <Route path="apps/geoscience/geomechanics" element={<Navigate to="/dashboard/apps/drilling/geomechanics-studio" replace />} />
                                
                                <Route path="apps/reservoir/fluid-systems-studio" element={<FluidSystemsStudio />} />
                                {/* W6: surveillance absorbed into the Waterflood Design Studio */}
                                <Route path="apps/reservoir/waterflood-dashboard" element={<Navigate to="/apps/reservoir/waterflood-design-studio?tab=surveillance" replace />} />
                                <Route path="apps/reservoir/voidage-replacement-monitor" element={<VoidageReplacementMonitor />} />
                                <Route path="apps/reservoir/waterflood-design-studio" element={<WaterfloodDesignStudio />} />
                                <Route path="apps/reservoir/scal-studio" element={<ScalStudio />} />
                                <Route path="apps/reservoir/reservoir-simulation-studio" element={<ProtectedAppRoute appId="reservoir-simulation-studio" appName="Reservoir Simulation Studio"><ReservoirSimulationStudio /></ProtectedAppRoute>} />
                                <Route path="apps/reservoir/well-test-analysis-studio" element={<WellTestAnalysisStudio />} />
                                {/* tile slug (kept as the entitlement key; WT3 tile migration moves it to Reservoir) */}
                                <Route path="apps/reservoir/well-test-analyzer" element={<WellTestAnalysisStudio />} />
                                {/* legacy slugs (incl. the tile slug) — aliases into the studio */}
                                <Route path="apps/reservoir/fractional-flow-calculator" element={<WaterfloodDesignStudio />} />
                                {/* SC6: rel-perm home is SCAL Studio (alias tile archived by 20260719110500) */}
                                <Route path="apps/reservoir/relative-permeability-designer" element={<Navigate to="/dashboard/apps/reservoir/scal-studio" replace />} />
                                <Route path="apps/reservoir/recovery-factor-estimator" element={<RecoveryFactorEstimator />} />
                                <Route path="apps/reservoir/risked-reserves-valuation" element={<RiskedReservesValuation />} />
                                <Route path="apps/reservoir/risked-reserves-valuation/help" element={<RiskedReservesHelpGuide />} />
                                <Route path="apps/reservoir/eor-screening" element={<EorScreeningTool />} />
                                <Route path="apps/reservoir/eor-screening/help" element={<EorScreeningHelpGuide />} />
                                <Route path="apps/reservoir/forecast-scenario-hub" element={<ForecastScenarioHub />} />
                                <Route path="apps/reservoir/forecast-scenario-hub/help" element={<ForecastScenarioHubHelpGuide />} />
                                <Route path="apps/reservoir/aquifer-influx-calculator" element={<Navigate to="/dashboard/apps/reservoir/reservoir-balance?tab=aquifer" replace />} />
                                <Route path="apps/reservoir/decline-curve-analysis" element={<DeclineCurveAnalysis />} />
                                <Route path="apps/reservoir/reservoir-balance" element={<ReservoirBalance />} />
                                <Route path="apps/reservoir/reservoir-balance/cases/:caseId" element={<ReservoirBalance />} />
                                {/* Added multiple aliases to prevent 404 routing mismatches with various database slugs */}
                                <Route path="apps/reservoir/reservoir-balance-pro" element={<ReservoirBalance />} />
                                <Route path="apps/reservoir/reservoir-balance-pro/cases/:caseId" element={<ReservoirBalance />} />
                                <Route path="apps/reservoir/reservoir-balance-surveillance" element={<ReservoirBalance />} />
                                <Route path="apps/reservoir/reservoir-balance-surveillance/cases/:caseId" element={<ReservoirBalance />} />
                                <Route path="apps/reservoir/material-balance-studio" element={<ReservoirBalance />} />
                                <Route path="apps/reservoir/material-balance-studio/cases/:caseId" element={<ReservoirBalance />} />
                                {/* R0-archived shells (nonexistent scenario-planner-engine) — redirect to their real successors */}
                                <Route path="apps/reservoir/scenario-planner" element={<Navigate to="/dashboard/apps/reservoir/forecast-scenario-hub" replace />} />
                                <Route path="apps/reservoir/eor-designer" element={<Navigate to="/dashboard/apps/reservoir/eor-screening" replace />} />
                                <Route path="apps/reservoir/uncertainty-analysis" element={<Navigate to="/dashboard/apps/geoscience/reservoircalc-pro" replace />} />
                                {/* S2: the old connector slug now lands on the real simulation studio */}
                                <Route path="apps/reservoir/reservoir-simulation-connector" element={<Navigate to="/dashboard/apps/reservoir/reservoir-simulation-studio" replace />} />

                                <Route path="apps/drilling/well-planning" element={<ProtectedAppRoute appId="well-planning" appName="Well Design Studio"><WellPlanning /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/well-planning/help" element={<ProtectedAppRoute appId="well-planning" appName="Well Design Studio"><WellDesignHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/well-planning/:wellId" element={<ProtectedAppRoute appId="well-planning" appName="Well Design Studio"><WellPlanning /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/casing-tubing-design-pro" element={<ProtectedAppRoute appId="casing-tubing-design-pro" appName="Casing & Tubing Design Studio"><CasingTubingDesignPro /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/casing-tubing-design-pro/help" element={<ProtectedAppRoute appId="casing-tubing-design-pro" appName="Casing & Tubing Design Studio"><CasingTubingHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/completion-design-studio" element={<ProtectedAppRoute appId="completion-design-studio" appName="Completion Design Studio"><CompletionDesignStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/completion-design-studio/help" element={<ProtectedAppRoute appId="completion-design-studio" appName="Completion Design Studio"><CompletionDesignHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/perforation-sand-control" element={<ProtectedAppRoute appId="perforation-sand-control" appName="Perforation & Sand Control Designer"><PerforationSandControlStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/perforation-sand-control/help" element={<ProtectedAppRoute appId="perforation-sand-control" appName="Perforation & Sand Control Designer"><PerforationSandControlHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/stimulation-designer" element={<ProtectedAppRoute appId="stimulation-designer" appName="Stimulation Designer"><StimulationDesignerStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/stimulation-designer/help" element={<ProtectedAppRoute appId="stimulation-designer" appName="Stimulation Designer"><StimulationDesignerHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/well-integrity-pa" element={<ProtectedAppRoute appId="well-integrity-pa" appName="Well Integrity & P&A Studio"><WellIntegrityPAStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/well-integrity-pa/help" element={<ProtectedAppRoute appId="well-integrity-pa" appName="Well Integrity & P&A Studio"><WellIntegrityPAHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/well-cost-time" element={<ProtectedAppRoute appId="well-cost-time" appName="Well Cost & Time Estimator"><WellCostTimeStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/well-cost-time/help" element={<ProtectedAppRoute appId="well-cost-time" appName="Well Cost & Time Estimator"><WellCostTimeHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/geomechanics-studio" element={<ProtectedAppRoute appId="geomechanics-studio" appName="Geomechanics & Wellbore Stability Studio"><GeomechanicsStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/geomechanics-studio/help" element={<ProtectedAppRoute appId="geomechanics-studio" appName="Geomechanics & Wellbore Stability Studio"><GeomechanicsHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/cementing-studio" element={<ProtectedAppRoute appId="cementing-studio" appName="Cementing Studio"><CementingStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/cementing-studio/help" element={<ProtectedAppRoute appId="cementing-studio" appName="Cementing Studio"><CementingHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/well-control-studio" element={<ProtectedAppRoute appId="well-control-studio" appName="Well Control Studio"><WellControlStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/well-control-studio/help" element={<ProtectedAppRoute appId="well-control-studio" appName="Well Control Studio"><WellControlHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/torque-drag-studio" element={<ProtectedAppRoute appId="torque-drag-studio" appName="Torque & Drag Studio"><TorqueDragStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/torque-drag-studio/help" element={<ProtectedAppRoute appId="torque-drag-studio" appName="Torque & Drag Studio"><TorqueDragHelpGuide /></ProtectedAppRoute>} />
                                {/* legacy PPFG shell — retired for Pore Pressure Studio (plan Q2) */}
                                <Route path="apps/drilling/pore-pressure-fracture-gradient" element={<Navigate to="/dashboard/apps/geoscience/pore-pressure-studio" replace />} />
                                {/* D0-archived shells (Drilling-ROADMAP.md §1) — mock/broken apps derouted
                                    until their D1-D9 successors ship; tiles Archived in 20260826100000 */}
                                <Route path="apps/drilling/casing-wear-analyzer" element={<Navigate to="/dashboard/drilling" replace />} />
                                {/* D2: the drilling-fluids-hydraulics slug is REBUILT (Drilling-ROADMAP.md §2) */}
                                <Route path="apps/drilling/drilling-fluids-hydraulics" element={<ProtectedAppRoute appId="drilling-fluids-hydraulics" appName="Drilling Fluids & Hydraulics Studio"><HydraulicsStudio /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/drilling-fluids-hydraulics/help" element={<ProtectedAppRoute appId="drilling-fluids-hydraulics" appName="Drilling Fluids & Hydraulics Studio"><HydraulicsHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/drilling/torque-drag-predictor" element={<Navigate to="/dashboard/drilling" replace />} />
                                <Route path="apps/drilling/cementing-simulation" element={<Navigate to="/dashboard/drilling" replace />} />
                                <Route path="apps/drilling/frac-completion" element={<Navigate to="/dashboard/drilling" replace />} />
                                <Route path="apps/drilling/rto-dashboard" element={<Navigate to="/dashboard/drilling" replace />} />
                                <Route path="apps/drilling/incident-finder" element={<Navigate to="/dashboard/drilling" replace />} />
                                <Route path="apps/drilling/wellbore-stability-analyzer" element={<Navigate to="/dashboard/drilling" replace />} />
                                {/* well-spacing-optimizer moved to the Reservoir module at D0 */}
                                <Route path="apps/drilling/well-spacing-optimizer" element={<Navigate to="/dashboard/apps/reservoir/well-spacing-optimizer" replace />} />
                                <Route path="apps/reservoir/well-spacing-optimizer" element={<ProtectedAppRoute appId="well-spacing-optimizer" appName="Well Spacing Optimizer"><WellSpacingOptimizer /></ProtectedAppRoute>} />
                                <Route path="apps/reservoir/well-spacing-optimizer/help" element={<ProtectedAppRoute appId="well-spacing-optimizer" appName="Well Spacing Optimizer"><WellSpacingHelpGuide /></ProtectedAppRoute>} />

                                {/* Production Module routes (P0 hygiene 2026-08-27, Production-ROADMAP.md §5):
                                    archived mock apps redirect to the hub until their rebuild phase ships;
                                    every surviving app is entitlement-gated. */}
                                {/* P2: Production Surveillance Studio — the rebuild of the retired dashboard, on the po_* spine */}
                                <Route path="apps/production/production-surveillance-studio" element={<ProtectedAppRoute appId="production-surveillance-studio" appName="Production Surveillance Studio"><ProductionSurveillanceStudio /></ProtectedAppRoute>} />
                                <Route path="apps/production/production-surveillance-dashboard" element={<Navigate to="/dashboard/apps/production/production-surveillance-studio" replace />} />
                                <Route path="apps/production/surveillance-dashboard" element={<Navigate to="/dashboard/apps/production/production-surveillance-studio" replace />} />
                                {/* P3: Production Allocation Studio — back-allocation on the po_* spine */}
                                <Route path="apps/production/production-allocation-studio" element={<ProtectedAppRoute appId="production-allocation-studio" appName="Production Allocation Studio"><ProductionAllocationStudio /></ProtectedAppRoute>} />
                                {/* P4: Gas Lift Design Studio — valve spacing, unloading and injection depth over the production engines */}
                                <Route path="apps/production/gas-lift-design-studio" element={<ProtectedAppRoute appId="gas-lift-design-studio" appName="Gas Lift Design Studio"><GasLiftDesignStudio /></ProtectedAppRoute>} />
                                <Route path="apps/production/esp-design-studio" element={<ProtectedAppRoute appId="esp-design-studio" appName="ESP Design Studio"><EspDesignStudio /></ProtectedAppRoute>} />
                                <Route path="apps/production/rod-pump-design-studio" element={<ProtectedAppRoute appId="rod-pump-design-studio" appName="Rod Pump Design Studio"><RodPumpDesignStudio /></ProtectedAppRoute>} />
                                <Route path="apps/production/gas-well-performance-studio" element={<ProtectedAppRoute appId="gas-well-performance-studio" appName="Gas Well Performance Studio"><GasWellPerformanceStudio /></ProtectedAppRoute>} />
                                <Route path="apps/production/choke-performance-studio" element={<ProtectedAppRoute appId="choke-performance-studio" appName="Choke & Wellhead Performance Studio"><ChokePerformanceStudio /></ProtectedAppRoute>} />
                                <Route path="apps/production/well-test-analyzer" element={<Navigate to="/dashboard/apps/reservoir/well-test-analysis-studio" replace />} />
                                {/* Production Forecasting tile archived at P0 — the real engine is DCA Studio */}
                                <Route path="apps/production/production-forecasting" element={<Navigate to="/dashboard/apps/reservoir/decline-curve-analysis" replace />} />
                                <Route path="apps/production/nodal-analysis-studio" element={<ProtectedAppRoute appId="nodal-analysis-engine" appName="Nodal Analysis Studio"><NodalAnalysisStudio /></ProtectedAppRoute>} />
                                <Route path="apps/production/nodal-analysis-engine" element={<ProtectedAppRoute appId="nodal-analysis-engine" appName="Nodal Analysis Studio"><NodalAnalysisStudio /></ProtectedAppRoute>} />
                                <Route path="apps/production/nodal-performance-optimizer" element={<ProtectedAppRoute appId="nodal-analysis-engine" appName="Nodal Analysis Studio"><NodalAnalysisStudio /></ProtectedAppRoute>} />
                                {/* P0: Wellbore Flow Simulator retired (Production-ROADMAP.md §6.3) — its "transient simulation" was a Math.random pressure walk; real traverses live in Nodal */}
                                <Route path="apps/production/wellbore-flow-simulator" element={<Navigate to="/dashboard/apps/production/nodal-analysis-studio" replace />} />
                                <Route path="apps/production/artificial-lift-designer" element={<ProtectedAppRoute appId="artificial-lift-designer" appName="Artificial Lift Advisor"><ArtificialLiftAdvisor /></ProtectedAppRoute>} />
                                {/* P9 renamed the app; the slug stays so entitlements and pricing keep working, and the new name routes to the same page. */}
                                <Route path="apps/production/artificial-lift-advisor" element={<ProtectedAppRoute appId="artificial-lift-designer" appName="Artificial Lift Advisor"><ArtificialLiftAdvisor /></ProtectedAppRoute>} />
                                <Route path="apps/production/flow-assurance-studio" element={<ProtectedAppRoute appId="flow-assurance-studio" appName="Flow Assurance Studio"><FlowAssuranceStudio /></ProtectedAppRoute>} />
                                {/* The archived P0 app. Its slug stays a redirect: the
                                    replacement is a different app with a different id, not
                                    a revival of this one. */}
                                <Route path="apps/production/flow-assurance-monitor" element={<Navigate to="/dashboard/production" replace />} />
                                <Route path="apps/production/integrated-asset-modeler" element={<Navigate to="/dashboard/apps/production/nodal-analysis-studio" replace />} />
                                {/* D7: Well Schematic Designer absorbed by Completion Design Studio (Drilling-ROADMAP.md §2) */}
                                <Route path="apps/production/well-schematic-designer" element={<Navigate to="/dashboard/apps/drilling/completion-design-studio" replace />} />
                                {/* P0: Network Diagram Pro delisted (§6.4) — inert solver, no persistence; its editor folds into Production Network Studio at P11 */}
                                <Route path="apps/production/well-intervention-planner" element={<ProtectedAppRoute appId="well-intervention-planner" appName="Well Intervention Planner"><WellInterventionPlanner /></ProtectedAppRoute>} />
                                {/* The four shells this replaces were archived at P0 and are
                                    never revived; these slugs stay redirects. */}
                                <Route path="apps/production/stimulation-candidate-selector" element={<Navigate to="/dashboard/production/apps/production/well-intervention-planner" replace />} />
                                <Route path="apps/production/water-gas-shutoff-planner" element={<Navigate to="/dashboard/production/apps/production/well-intervention-planner" replace />} />
                                <Route path="apps/production/workover-planner" element={<Navigate to="/dashboard/production/apps/production/well-intervention-planner" replace />} />
                                <Route path="apps/production/rigless-intervention-planner" element={<Navigate to="/dashboard/production/apps/production/well-intervention-planner" replace />} />
                                <Route path="apps/production/production-network-studio" element={<ProtectedAppRoute appId="production-network-studio" appName="Production Network Studio"><ProductionNetworkStudio /></ProtectedAppRoute>} />
                                {/* Network Diagram Pro was delisted at P0 (a canvas whose Solve
                                    button raised a toast). Its slug stays a redirect: the editor
                                    returns inside the Production Network Studio, which is a
                                    different app with a different id. */}
                                <Route path="apps/production/network-diagram-pro" element={<Navigate to="/dashboard/production" replace />} />

                                <Route path="apps/economics/project-management-pro" element={<ProtectedAppRoute appId="project-management-pro" appName="Project Management Pro"><ProjectManagementPro /></ProtectedAppRoute>} />
                                
                                {/* AFE Cost Control Manager explicit robust routes matching the registry fix */}
                                <Route path="apps/economics-project-management/afe-cost-control-manager" element={<ProtectedAppRoute appId="afe-cost-control-manager" appName="AFE Cost Control Manager"><AfeCostControlManager /></ProtectedAppRoute>} />
                                <Route path="apps/economics/afe-cost-control-manager" element={<ProtectedAppRoute appId="afe-cost-control-manager" appName="AFE Cost Control Manager"><AfeCostControlManager /></ProtectedAppRoute>} />
                                <Route path="apps/economic/afe-cost-control-manager" element={<ProtectedAppRoute appId="afe-cost-control-manager" appName="AFE Cost Control Manager"><AfeCostControlManager /></ProtectedAppRoute>} />
                                <Route path="apps/economics/afe-cost-control" element={<ProtectedAppRoute appId="afe-cost-control-manager" appName="AFE Cost Control Manager"><AfeCostControlManager /></ProtectedAppRoute>} />
                                
                                {/* Technical Report Autopilot explicit robust routes matching the registry fix */}
                                <Route path="apps/economics-project-management/technical-report-autopilot" element={<ProtectedAppRoute appId="technical-report-autopilot" appName="Technical Report Autopilot"><TechnicalReportAutopilot /></ProtectedAppRoute>} />
                                <Route path="apps/economics/technical-report-autopilot" element={<ProtectedAppRoute appId="technical-report-autopilot" appName="Technical Report Autopilot"><TechnicalReportAutopilot /></ProtectedAppRoute>} />
                                <Route path="apps/economic/technical-report-autopilot" element={<ProtectedAppRoute appId="technical-report-autopilot" appName="Technical Report Autopilot"><TechnicalReportAutopilot /></ProtectedAppRoute>} />
                                <Route path="apps/economics/report-autopilot" element={<ProtectedAppRoute appId="technical-report-autopilot" appName="Technical Report Autopilot"><TechnicalReportAutopilot /></ProtectedAppRoute>} />
                                
                                {/* Probabilistic Breakeven Analyzer targeted robust routing aliases mapping exactly to the app card logic */}
                                <Route path="apps/economics-project-management/probabilistic-breakeven-analyzer" element={<ProtectedAppRoute appId="probabilistic-breakeven-analyzer" appName="Probabilistic Breakeven Analyzer"><ProbabilisticBreakevenAnalyzer /></ProtectedAppRoute>} />
                                <Route path="apps/economics/probabilistic-breakeven-analyzer" element={<ProtectedAppRoute appId="probabilistic-breakeven-analyzer" appName="Probabilistic Breakeven Analyzer"><ProbabilisticBreakevenAnalyzer /></ProtectedAppRoute>} />
                                <Route path="apps/economic/probabilistic-breakeven-analyzer" element={<ProtectedAppRoute appId="probabilistic-breakeven-analyzer" appName="Probabilistic Breakeven Analyzer"><ProbabilisticBreakevenAnalyzer /></ProtectedAppRoute>} />
                                <Route path="apps/economics/breakeven-analyzer" element={<ProtectedAppRoute appId="probabilistic-breakeven-analyzer" appName="Probabilistic Breakeven Analyzer"><ProbabilisticBreakevenAnalyzer /></ProtectedAppRoute>} />
                                
                                {/* Value of Information Analyzer robust routing */}
                                <Route path="apps/economics-project-management/value-of-information-analyzer" element={<ProtectedAppRoute appId="value-of-information-analyzer" appName="Value of Information Analyzer"><ValueOfInformationAnalyzer /></ProtectedAppRoute>} />
                                <Route path="apps/economics/value-of-information-analyzer" element={<ProtectedAppRoute appId="value-of-information-analyzer" appName="Value of Information Analyzer"><ValueOfInformationAnalyzer /></ProtectedAppRoute>} />
                                <Route path="apps/economic/value-of-information-analyzer" element={<ProtectedAppRoute appId="value-of-information-analyzer" appName="Value of Information Analyzer"><ValueOfInformationAnalyzer /></ProtectedAppRoute>} />
                                <Route path="apps/economics/voi-analyzer" element={<ProtectedAppRoute appId="value-of-information-analyzer" appName="Value of Information Analyzer"><ValueOfInformationAnalyzer /></ProtectedAppRoute>} />
                                
                                <Route path="apps/economics/npv-scenario-builder" element={<ProtectedAppRoute appId="npv-scenario-builder" appName="NPV Scenario Builder"><NpvScenarioBuilder /></ProtectedAppRoute>} />
                                <Route path="apps/economics/decision-tree-builder" element={<ProtectedAppRoute appId="decision-tree-builder" appName="Decision Tree Builder"><DecisionTreeBuilder /></ProtectedAppRoute>} />
                                <Route path="apps/economics/decision-studio" element={<ProtectedAppRoute appId="decision-studio" appName="Decision Studio"><DecisionStudio /></ProtectedAppRoute>} />
                                <Route path="apps/economics/fiscal-regime-designer" element={<ProtectedAppRoute appId="fiscal-regime-designer" appName="Fiscal Regime Designer"><FiscalRegimeDesigner /></ProtectedAppRoute>} />
                                <Route path="apps/economics/capital-portfolio-studio" element={<ProtectedAppRoute appId="capital-portfolio-studio" appName="Capital Portfolio Studio"><CapitalPortfolioStudio /></ProtectedAppRoute>} />
                                <Route path="apps/economics/fdp-accelerator" element={<ProtectedAppRoute appId="fdp-accelerator" appName="FDP Accelerator"><FdpAccelerator /></ProtectedAppRoute>} />
                                
                                {/* Petroleum Economics Studio: the legacy standalone app is retired
                                    (2026-08-16); EPE carries the name now. Old links land on it. */}
                                <Route path="apps/economics-project-management/petroleum-economics-studio/*" element={<Navigate to="/dashboard/apps/economics/epe/cases" replace />} />
                                <Route path="apps/economics/petroleum-economics-studio/*" element={<Navigate to="/dashboard/apps/economics/epe/cases" replace />} />
                                <Route path="apps/economic/petroleum-economics-studio/*" element={<Navigate to="/dashboard/apps/economics/epe/cases" replace />} />

                                {/* Petroleum Economics Studio (slug epe-suite) routing aliases mapping exactly to the app card logic */}
                                <Route path="apps/economics-project-management/epe-suite" element={<Navigate to="/dashboard/apps/economics/epe/cases" replace />} />
                                <Route path="apps/economics/epe-suite" element={<Navigate to="/dashboard/apps/economics/epe/cases" replace />} />
                                <Route path="apps/economic/epe-suite" element={<Navigate to="/dashboard/apps/economics/epe/cases" replace />} />
                                
                                <Route path="apps/economics/epe/cases" element={<ProtectedAppRoute appId="epe-suite" appName="Petroleum Economics Studio"><EpeCaseList /></ProtectedAppRoute>} />
                                <Route path="apps/economics/epe/help" element={<ProtectedAppRoute appId="epe-suite" appName="Petroleum Economics Studio"><EpeHelpGuide /></ProtectedAppRoute>} />
                                <Route path="apps/economics/epe/cases/:caseId" element={<ProtectedAppRoute appId="epe-suite" appName="Petroleum Economics Studio"><EpeCaseDetail /></ProtectedAppRoute>} />
				<Route path="apps/economics/epe/cases/:caseId/run" element={<ProtectedAppRoute appId="epe-suite" appName="Petroleum Economics Studio"><EpeRunConsole /></ProtectedAppRoute>} />
                                <Route path="apps/economics/epe/cases/:caseId/compare" element={<ProtectedAppRoute appId="epe-suite" appName="Petroleum Economics Studio"><EpeRunComparison /></ProtectedAppRoute>} />
                                <Route path="apps/economics/epe/runs/:runId" element={<ProtectedAppRoute appId="epe-suite" appName="Petroleum Economics Studio"><EpeResultsViewer /></ProtectedAppRoute>} />
                                {/* run/:runId used to open the Run Console, which needs a caseId and
                                    broke; a run link means "show me the run" — send it to results. */}
                                <Route path="apps/economics/epe/run/:runId" element={<ProtectedAppRoute appId="epe-suite" appName="Petroleum Economics Studio"><EpeResultsViewer /></ProtectedAppRoute>} />
                                <Route path="apps/economics/epe/results/:runId" element={<ProtectedAppRoute appId="epe-suite" appName="Petroleum Economics Studio"><EpeResultsViewer /></ProtectedAppRoute>} />
                                {/* compare without a caseId cannot query; land on the case list */}
                                <Route path="apps/economics/epe/compare" element={<Navigate to="/dashboard/apps/economics/epe/cases" replace />} />

                                {/* Facilities F0 (Facilities-ROADMAP.md): every facilities route gated; three shell
                                    apps retired. Compressor & Pump Pack printed hardcoded literals (real studios ship
                                    at F9/F10); Pipeline Designer fabricated results behind a setTimeout; Pipeline
                                    Sizer called a nonexistent edge function and always fell back to a hardcoded mock.
                                    Single-line sizing lives in Facility Network Hydraulics until the F1 flagship. */}
                                {/* Facilities F5: the slug keeps its entitlements while the app becomes the
                                    Separator & Slug Catcher Studio (API 12J/GPSA on the vendored engine). */}
                                <Route path="apps/facilities/separator-slug-catcher-designer" element={<ProtectedAppRoute appId="separator-slug-catcher-designer" appName="Separator & Slug Catcher Studio"><SeparatorSlugCatcherDesigner /></ProtectedAppRoute>} />
                                <Route path="apps/facilities/compressor-pump-pack" element={<Navigate to="/dashboard/facilities" replace />} />
                                {/* Facilities F9: the NEW compressor app on a fresh slug. The retired
                                    pack above stays archived and redirecting; this is a different app. */}
                                <Route path="apps/facilities/compressor-station-designer" element={<ProtectedAppRoute appId="compressor-station-designer" appName="Compressor Station Designer"><CompressorStationDesigner /></ProtectedAppRoute>} />
                                {/* Facilities F10: the other half of the retired pack, likewise on a fresh slug. */}
                                <Route path="apps/facilities/pump-station-designer" element={<ProtectedAppRoute appId="pump-station-designer" appName="Pump Station Designer"><PumpStationDesigner /></ProtectedAppRoute>} />
                                {/* Facilities F11: ISA 75.01 valve sizing on a fresh slug. */}
                                <Route path="apps/facilities/control-valve-sizing" element={<ProtectedAppRoute appId="control-valve-sizing" appName="Control Valve & Choke Sizing"><ControlValveSizing /></ProtectedAppRoute>} />
                                <Route path="apps/facilities/storage-tank-designer" element={<ProtectedAppRoute appId="storage-tank-designer" appName="Storage Tank & Venting Designer"><StorageTankDesigner /></ProtectedAppRoute>} />
                                <Route path="apps/facilities/flow-metering-designer" element={<ProtectedAppRoute appId="flow-metering-designer" appName="Flow Metering Designer"><FlowMeteringDesigner /></ProtectedAppRoute>} />
                                {/* Midstream & Downstream DS1: the module's first app. */}
                                <Route path="apps/midstream-downstream/crude-assay-blending-studio" element={<ProtectedAppRoute appId="crude-assay-blending-studio" appName="Crude Assay & Blending Studio"><CrudeAssayBlendingStudio /></ProtectedAppRoute>} />
                                <Route path="apps/midstream-downstream/product-blending-optimizer" element={<ProtectedAppRoute appId="product-blending-optimizer" appName="Product Blending Optimizer"><ProductBlendingOptimizer /></ProtectedAppRoute>} />
                                <Route path="apps/midstream-downstream/refinery-planning-scheduling" element={<ProtectedAppRoute appId="refinery-planning-scheduling" appName="Refinery Planning & Scheduling Studio"><RefineryPlanningStudio /></ProtectedAppRoute>} />
                                {/* Facilities F4: the slug keeps its entitlements while the app becomes the
                                    Heat Exchanger & Cooling Studio (F computed, U assembled, hot-day derate). */}
                                <Route path="apps/facilities/heat-exchanger-sizer" element={<ProtectedAppRoute appId="heat-exchanger-sizer" appName="Heat Exchanger & Cooling Studio"><HeatExchangerSizer /></ProtectedAppRoute>} />
                                {/* Facilities F3: the slug keeps its entitlements while the app becomes the
                                    Gas Processing Studio (dehydration + sweetening + dew point, owner decision F#1). */}
                                <Route path="apps/facilities/gas-treating-dehydration" element={<ProtectedAppRoute appId="gas-treating-dehydration" appName="Gas Processing Studio"><GasTreatingDehydration /></ProtectedAppRoute>} />
                                {/* Facilities F2: the slug keeps its entitlements while the app becomes the
                                    Relief & Flare Studio (API 520/521 on the vendored engine). */}
                                <Route path="apps/facilities/relief-blowdown-sizer" element={<ProtectedAppRoute appId="relief-blowdown-sizer" appName="Relief & Flare Studio"><ReliefBlowdownSizer /></ProtectedAppRoute>} />
                                {/* Facilities F1: the slug keeps its entitlements while the app becomes the
                                    Pipeline & Line Sizing Studio flagship (validated engines; single-line only per
                                    Production-ROADMAP.md §6.2 — the gathering-network solver is Production #11). */}
                                <Route path="apps/facilities/facility-network-hydraulics" element={<ProtectedAppRoute appId="facility-network-hydraulics" appName="Pipeline & Line Sizing Studio"><PipelineLineSizingStudio /></ProtectedAppRoute>} />
                                <Route path="apps/facilities/facility-layout-mapper" element={<ProtectedAppRoute appId="facility-layout-mapper" appName="Facility Layout Mapper"><FacilityLayoutMapper /></ProtectedAppRoute>} />
                                {/* Facilities F6: the slug keeps its entitlements while the app becomes the
                                    Corrosion & Integrity Studio (DWM 1995 with velocity, shear, inhibitor
                                    availability, sour regions and remaining life). */}
                                <Route path="apps/facilities/corrosion-rate-predictor" element={<ProtectedAppRoute appId="corrosion-rate-predictor" appName="Corrosion & Integrity Studio"><CorrosionRatePredictor /></ProtectedAppRoute>} />
                                <Route path="apps/facilities/pipeline-designer" element={<Navigate to="/dashboard/apps/facilities/facility-network-hydraulics" replace />} />
                                <Route path="apps/facilities/pipeline-sizer" element={<Navigate to="/dashboard/apps/facilities/facility-network-hydraulics" replace />} />
                                {/* Facilities F7: rebuilt on droplet physics; the slug keeps its entitlements. */}
                                <Route path="apps/facilities/produced-water-treatment" element={<ProtectedAppRoute appId="produced-water-treatment" appName="Produced Water Treatment Studio"><ProducedWaterTreatment /></ProtectedAppRoute>} />
                                
                                {/* Assurance routes */}
                                <Route path="apps/assurance/risk-heatmap" element={<Navigate to="/dashboard/apps/assurance/risk-register?tab=heatmap" replace />} />
                                
                                {/* Risk Register Full Flow Routes */}
                                <Route path="apps/assurance/risk-register" element={<ProtectedAppRoute appId="risk-register" appName="Risk Register"><RiskRegister /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/risk-register/new" element={<ProtectedAppRoute appId="risk-register" appName="Risk Register"><NewRiskPage /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/risk-register/:id" element={<ProtectedAppRoute appId="risk-register" appName="Risk Register"><RiskDetailPage /></ProtectedAppRoute>} />

                                {/* Document Control Flow Routes */}
                                <Route path="apps/assurance/document-control" element={<ProtectedAppRoute appId="document-control" appName="Document Control"><DocControlDashboard /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/document-control/library" element={<ProtectedAppRoute appId="document-control" appName="Document Control"><DocControlLibrary /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/document-control/new" element={<ProtectedAppRoute appId="document-control" appName="Document Control"><DocControlNew /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/document-control/approvals" element={<ProtectedAppRoute appId="document-control" appName="Document Control"><DocControlApprovals /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/document-control/reports" element={<ProtectedAppRoute appId="document-control" appName="Document Control"><DocControlReports /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/document-control/:id" element={<ProtectedAppRoute appId="document-control" appName="Document Control"><DocControlDetail /></ProtectedAppRoute>} />

                                {/* Peer Review Manager Routes */}
                                <Route path="apps/assurance/peer-review-manager" element={<ProtectedAppRoute appId="peer-review-manager" appName="Peer Review Manager"><PeerReviewDashboard /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/peer-review-manager/register" element={<ProtectedAppRoute appId="peer-review-manager" appName="Peer Review Manager"><PeerReviewRegister /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/peer-review-manager/new" element={<ProtectedAppRoute appId="peer-review-manager" appName="Peer Review Manager"><PeerReviewNew /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/peer-review-manager/reports" element={<ProtectedAppRoute appId="peer-review-manager" appName="Peer Review Manager"><PeerReviewReports /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/peer-review-manager/:id" element={<ProtectedAppRoute appId="peer-review-manager" appName="Peer Review Manager"><PeerReviewDetail /></ProtectedAppRoute>} />

                                {/* Management of Change (MOC) Routes */}
                                <Route path="apps/assurance/management-of-change" element={<ProtectedAppRoute appId="management-of-change" appName="Management of Change"><MOCDashboard /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/management-of-change/register" element={<ProtectedAppRoute appId="management-of-change" appName="Management of Change"><MOCRegister /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/management-of-change/new" element={<ProtectedAppRoute appId="management-of-change" appName="Management of Change"><MOCNew /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/management-of-change/approvals" element={<ProtectedAppRoute appId="management-of-change" appName="Management of Change"><MOCApprovals /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/management-of-change/reports" element={<ProtectedAppRoute appId="management-of-change" appName="Management of Change"><MOCReports /></ProtectedAppRoute>} />
                                <Route path="apps/assurance/management-of-change/:id" element={<ProtectedAppRoute appId="management-of-change" appName="Management of Change"><MOCDetail /></ProtectedAppRoute>} />
                                
                                {/* Quality Assurance Plan Routes */}
                                <Route path="apps/assurance/qa-plan/*" element={<ProtectedAppRoute appId="quality-assurance-plan" appName="Quality Assurance Plan"><QAPlanPageShell /></ProtectedAppRoute>} />

                                {/* Regulatory Compliance Routes */}
                                <Route path="apps/assurance/regulatory-compliance/*" element={<ProtectedAppRoute appId="regulatory-compliance" appName="Regulatory Compliance"><RegulatoryCompliancePageShell /></ProtectedAppRoute>} />

                                {/* ISO Compliance Routes */}
                                <Route path="apps/assurance/iso-compliance/*" element={<ProtectedAppRoute appId="iso-compliance-tool" appName="ISO Compliance"><ISOCompliancePageShell /></ProtectedAppRoute>} />

                                {/* Lessons Learned Routes */}
                                <Route path="apps/assurance/lessons-learned/*" element={<ProtectedAppRoute appId="lesson-learned-db" appName="Lessons Learned"><LessonsLearnedPageShell /></ProtectedAppRoute>} />

                                {/* legacy EarthModel Studio project list — retired with the ss_* drop */}
                                <Route path="my-projects" element={<Navigate to="/dashboard" replace />} />
                              </Route>

                              <Route path="/profile" element={
                                <ProtectedRoute>
                                  <Profile />
                                </ProtectedRoute>
                              }/>

                              <Route path="/solutions" element={<Solutions />} />
                              <Route path="/resources" element={<Resources />} />
                              <Route path="/nextgen" element={<NextGen />} />
                              <Route path="/about-us" element={<AboutUs />} />
                              <Route path="/careers" element={<Careers />} />
                              <Route path="/legal/terms-of-service" element={<TermsOfService />} />
                              <Route path="/legal/privacy-policy" element={<PrivacyPolicy />} />
                              <Route path="/legal/data-retention" element={<DataRetention />} />
                              <Route path="/legal/dpa" element={<DataProcessingAgreement />} />
                              <Route path="/legal/verify-deletion" element={<VerifyDeletion />} />
                              <Route path="/legal/support" element={<Support />} />
                              <Route path="/legal/documentation" element={<Documentation />} />

                              {/* Dev-only harnesses for the Playwright viewer suite; absent from prod builds */}
                              {import.meta.env.DEV && (
                                <>
                                  <Route path="/dev/scal-studio" element={<ScalStudio />} />
                                  <Route path="/dev/seismolord-selftest" element={<SeismolordSelfTest />} />
                                  <Route path="/dev/seismolord-sliceview" element={<SeismolordSliceViewHarness />} />
                                  <Route path="/dev/seismolord-cubeview" element={<SeismolordCubeViewHarness />} />
                                  <Route path="/dev/seismolord-wells" element={<SeismolordWellsHarness />} />
                                  <Route path="/dev/seismolord-welltie" element={<SeismolordWellTieHarness />} />
                                  <Route path="/dev/seismolord-synthetics" element={<SeismolordSyntheticsHarness />} />
                                  <Route path="/dev/seismolord-workspace" element={<SeismolordWorkspaceHarness />} />
                                  <Route path="/dev/well-data-manager" element={<WellDataManagerHarness />} />
                                  <Route path="/dev/petrophysics-studio" element={<PetrophysicsStudioHarness />} />
                                  <Route path="/dev/well-correlation" element={<WellCorrelationHarness />} />
                                  <Route path="/dev/mapping-surface-studio" element={<MappingSurfaceStudioHarness />} />
                                  <Route path="/dev/prospect-risking" element={<ProspectRiskingHarness />} />
                                  <Route path="/dev/rock-physics-studio" element={<RockPhysicsStudioHarness />} />
                                  <Route path="/dev/earth-modeling" element={<EarthModelingHarness />} />
                                  <Route path="/dev/pore-pressure-studio" element={<PorePressureStudioHarness />} />
                                  <Route path="/dev/well-design" element={<WellDesignHarness />} />
                                  <Route path="/dev/torque-drag" element={<TorqueDragHarness />} />
                                  <Route path="/dev/hydraulics" element={<HydraulicsHarness />} />
                                  <Route path="/dev/well-control" element={<WellControlHarness />} />
                                  <Route path="/dev/cementing" element={<CementingHarness />} />
                                  <Route path="/dev/geomechanics" element={<GeomechanicsHarness />} />
                                  <Route path="/dev/casing-tubing" element={<CasingTubingHarness />} />
                                  <Route path="/dev/completion-design" element={<CompletionDesignHarness />} />
                                  <Route path="/dev/perforation-sand-control" element={<PerforationSandControlHarness />} />
                                  <Route path="/dev/stimulation" element={<StimulationDesignerHarness />} />
                                  <Route path="/dev/well-integrity" element={<WellIntegrityPAHarness />} />
                                  <Route path="/dev/well-cost" element={<WellCostTimeHarness />} />
                                  <Route path="/dev/dca" element={<DeclineCurveAnalysis />} />
                                  <Route path="/dev/well-test-analysis-studio" element={<WellTestAnalysisStudio />} />
                                  <Route path="/dev/nodal-analysis-studio" element={<NodalAnalysisStudio />} />
                                  <Route path="/dev/material-balance-studio" element={<ReservoirBalance />} />
                                  <Route path="/dev/material-balance-studio/cases/:caseId" element={<ReservoirBalance />} />
                                </>
                              )}
                              <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                          </Suspense>
                        </div>
                    </AdminOrgProvider>
              </ReservoirProvider>
            </ErrorBoundary>
          </AuthGuard>
          <Toaster />
      </HSEProvider>
    </AuthProvider>
  );
}

export default App;
