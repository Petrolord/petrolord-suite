import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider as SupabaseAuthProvider } from './contexts/SupabaseAuthContext';
import { Toaster } from './components/ui/toaster';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';

// Lazy load components
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const DirectLogin = lazy(() => import('./pages/DirectLogin'));
const AdminCreateUser = lazy(() => import('./pages/AdminCreateUser'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Profile = lazy(() => import('./pages/Profile'));
const GetQuote = lazy(() => import('./pages/GetQuote'));
const QuoteBuilder = lazy(() => import('./pages/QuoteBuilder'));
const QuoteDashboard = lazy(() => import('./pages/QuoteDashboard'));
const EmployeeManagement = lazy(() => import('./pages/EmployeeManagement'));

// Module Dashboards
const Geoscience = lazy(() => import('./pages/dashboard/Geoscience'));
const Reservoir = lazy(() => import('./pages/dashboard/ReservoirManagement'));
const Drilling = lazy(() => import('./pages/dashboard/DrillingAndCompletion'));
const Production = lazy(() => import('./pages/dashboard/ProductionOperations'));
const EconomicsProjectManagementHub = lazy(() => import('./pages/dashboard/EconomicsProjectManagementHub'));
const Facilities = lazy(() => import('./pages/dashboard/FacilitiesAndInfrastructure'));
const Assurance = lazy(() => import('./pages/dashboard/Assurance'));

// Apps
const AutomatedLogDigitizer = lazy(() => import('./pages/apps/AutomatedLogDigitizer'));
const LogFaciesAnalysis = lazy(() => import('./pages/apps/LogFaciesAnalysis'));
const AnalogFinder = lazy(() => import('./pages/apps/AnalogFinder'));
const CrossplotGenerator = lazy(() => import('./pages/apps/CrossplotGenerator'));
const SeismicInterpretationPro = lazy(() => import('./pages/apps/SeismicInterpretationPro'));
const PetrophysicsEstimator = lazy(() => import('./pages/apps/PetrophysicsEstimator'));
const WellCorrelationTool = lazy(() => import('./pages/apps/WellCorrelationTool'));
const BasinFlowAnalysis = lazy(() => import('./pages/apps/BasinFlowAnalysis'));
const BasinFlowGenesis = lazy(() => import('./pages/apps/BasinFlowGenesis'));
const CementingSimulation = lazy(() => import('./pages/apps/CementingSimulationApp'));
const PorePressureFracGradient = lazy(() => import('./pages/apps/PorePressureFracGradient'));
const TubularDesignOptimizer = lazy(() => import('./pages/apps/TubularDesignOptimizer'));
const CasingTubingDesignPro = lazy(() => import('./pages/apps/CasingTubingDesignPro'));
const DirectionalDrillingPlanner = lazy(() => import('./pages/apps/DirectionalDrillingPlanner'));
const MudSystemDesigner = lazy(() => import('./pages/apps/MudSystemDesigner'));
const ProductionSurveillanceDashboard = lazy(() => import('./pages/apps/ProductionSurveillanceDashboard'));
const ArtificialLiftDesigner = lazy(() => import('./pages/apps/ArtificialLiftDesigner'));
const FlowAssuranceStudio = lazy(() => import('./pages/apps/FlowAssuranceStudio'));
const ReservoirSurveillanceStudio = lazy(() => import('./pages/apps/ReservoirSurveillanceStudio'));
const AfeCostControlManager = lazy(() => import('./pages/apps/AfeCostControlManager'));
const TechnicalReportAutopilot = lazy(() => import('./pages/apps/TechnicalReportAutopilot'));
const ProbabilisticBreakevenAnalyzer = lazy(() => import('./pages/apps/ProbabilisticBreakevenAnalyzer'));
const ValueOfInformationAnalyzer = lazy(() => import('./pages/apps/ValueOfInformationAnalyzer'));
const PetroleumEconomicsStudio = lazy(() => import('./pages/apps/PetroleumEconomicsStudio'));
const EPESuite = lazy(() => import('./pages/apps/EPESuite'));
const EpeCaseList = lazy(() => import('./pages/apps/epe/EpeCaseList'));
const EpeCaseDetail = lazy(() => import('./pages/apps/epe/EpeCaseDetail'));
const EpeRunConsole = lazy(() => import('./pages/apps/epe/EpeRunConsole'));
const EpeResultsViewer = lazy(() => import('./pages/apps/epe/EpeResultsViewer'));
const EpeRunComparison = lazy(() => import('./pages/apps/epe/EpeRunComparison'));
const PipelineDesigner = lazy(() => import('./pages/apps/PipelineDesigner'));
const ProducedWaterTreatment = lazy(() => import('./pages/apps/ProducedWaterTreatment'));
const FacilitiesLayoutDesigner = lazy(() => import('./pages/apps/FacilitiesLayoutDesigner'));
const FacilityMasterPlanner = lazy(() => import('./pages/apps/FacilityMasterPlanner'));
const HydraulicsSimulator = lazy(() => import('./pages/apps/HydraulicsSimulator'));
const NetworkOptimization = lazy(() => import('./pages/apps/NetworkOptimization'));
const NodalAnalysis = lazy(() => import('./pages/apps/NodalAnalysisEngine'));
const RiskHeatmap = lazy(() => import('./pages/apps/RiskHeatmap'));
const RiskRegister = lazy(() => import('./pages/apps/RiskRegister'));
const ManagementOfChange = lazy(() => import('./pages/apps/ManagementOfChange'));
const DocumentControl = lazy(() => import('./pages/apps/DocumentControl'));
const ComplianceTracker = lazy(() => import('./pages/apps/ComplianceTracker'));
const IncidentReporting = lazy(() => import('./pages/apps/IncidentReporting'));
const EmergencyResponsePlanner = lazy(() => import('./pages/apps/EmergencyResponsePlanner'));
const EnvironmentalMonitoring = lazy(() => import('./pages/apps/EnvironmentalMonitoring'));
const SafetyCaseManager = lazy(() => import('./pages/apps/SafetyCaseManager'));

// Project Management Apps
const ProjectManagementPro = lazy(() => import('./pages/apps/ProjectManagementPro'));
const RiskManagementMatrix = lazy(() => import('./pages/apps/RiskManagementMatrix'));
const ScheduleOptimizer = lazy(() => import('./pages/apps/ScheduleOptimizer'));
const CostControlDashboard = lazy(() => import('./pages/apps/CostControlDashboard'));
const ResourcePlanningTool = lazy(() => import('./pages/apps/ResourcePlanningTool'));
const QualityAssuranceTracker = lazy(() => import('./pages/apps/QualityAssuranceTracker'));
const StakeholderEngagementPortal = lazy(() => import('./pages/apps/StakeholderEngagementPortal'));
const LessonsLearnedDatabase = lazy(() => import('./pages/apps/LessonsLearnedDatabase'));
const ScenarioPlanner = lazy(() => import('./pages/apps/ScenarioPlanner'));
const IRRAnalysis = lazy(() => import('./pages/apps/IRRAnalysis'));
const NPVCalculator = lazy(() => import('./pages/apps/NPVCalculator'));
const FiscalRegimeDesigner = lazy(() => import('./pages/apps/FiscalRegimeDesigner'));
const WellTestAnalyzer = lazy(() => import('./pages/apps/WellTestDataAnalyzer'));

function App() {
  return (
    <SupabaseAuthProvider>
      <Router>
        <div className="App">
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/direct-login" element={<DirectLogin />} />
              <Route path="/admin/create-user" element={<AdminCreateUser />} />
              <Route path="/get-quote" element={<GetQuote />} />
              
              {/* Protected Routes */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/quote-builder" element={<ProtectedRoute><QuoteBuilder /></ProtectedRoute>} />
              <Route path="/dashboard/quote/:quoteId" element={<ProtectedRoute><QuoteDashboard /></ProtectedRoute>} />
              <Route path="/employee-management" element={<ProtectedRoute><EmployeeManagement /></ProtectedRoute>} />

              {/* Module Dashboards */}
              <Route path="/dashboard/geoscience" element={<ProtectedRoute><Geoscience /></ProtectedRoute>} />
              <Route path="/dashboard/reservoir" element={<ProtectedRoute><Reservoir /></ProtectedRoute>} />
              <Route path="/dashboard/drilling" element={<ProtectedRoute><Drilling /></ProtectedRoute>} />
              <Route path="/dashboard/production" element={<ProtectedRoute><Production /></ProtectedRoute>} />
              <Route path="/dashboard/economics" element={<ProtectedRoute><EconomicsProjectManagementHub /></ProtectedRoute>} />
              <Route path="/dashboard/economics-project-management" element={<ProtectedRoute><EconomicsProjectManagementHub /></ProtectedRoute>} />
              <Route path="/dashboard/facilities" element={<ProtectedRoute><Facilities /></ProtectedRoute>} />
              <Route path="/dashboard/assurance" element={<ProtectedRoute><Assurance /></ProtectedRoute>} />
              <Route path="/dashboard/hse" element={<ProtectedRoute><Assurance /></ProtectedRoute>} />

              {/* Geoscience Apps */}
              <Route path="/dashboard/apps/geoscience/automated-log-digitizer" element={<ProtectedRoute><AutomatedLogDigitizer /></ProtectedRoute>} />
              <Route path="/dashboard/apps/geoscience/log-facies-analysis" element={<ProtectedRoute><LogFaciesAnalysis /></ProtectedRoute>} />
              <Route path="/dashboard/apps/geoscience/analog-finder" element={<ProtectedRoute><AnalogFinder /></ProtectedRoute>} />
              <Route path="/dashboard/apps/geoscience/crossplot-generator" element={<ProtectedRoute><CrossplotGenerator /></ProtectedRoute>} />
              <Route path="/dashboard/apps/geoscience/seismic-interpretation-pro" element={<ProtectedRoute><SeismicInterpretationPro /></ProtectedRoute>} />
              <Route path="/dashboard/apps/geoscience/petrophysics-estimator" element={<ProtectedRoute><PetrophysicsEstimator /></ProtectedRoute>} />
              <Route path="/dashboard/apps/geoscience/well-correlation-tool" element={<ProtectedRoute><WellCorrelationTool /></ProtectedRoute>} />
              <Route path="/dashboard/apps/geoscience/basin-flow-analysis" element={<ProtectedRoute><BasinFlowAnalysis /></ProtectedRoute>} />
              <Route path="/dashboard/apps/geoscience/basin-flow-genesis" element={<ProtectedRoute><BasinFlowGenesis /></ProtectedRoute>} />

              {/* Reservoir Apps */}
              <Route path="/dashboard/apps/reservoir/scenario-planner" element={<ProtectedRoute><ScenarioPlanner /></ProtectedRoute>} />
              <Route path="/dashboard/apps/reservoir/well-test-analyzer" element={<ProtectedRoute><WellTestAnalyzer /></ProtectedRoute>} />

              {/* Drilling Apps */}
              <Route path="/dashboard/apps/drilling/cementing-simulation" element={<ProtectedRoute><CementingSimulation /></ProtectedRoute>} />
              <Route path="/dashboard/apps/drilling/pore-pressure-frac-gradient" element={<ProtectedRoute><PorePressureFracGradient /></ProtectedRoute>} />
              <Route path="/dashboard/apps/drilling/tubular-design-optimizer" element={<ProtectedRoute><TubularDesignOptimizer /></ProtectedRoute>} />
              <Route path="/dashboard/apps/drilling/casing-tubing-design-pro" element={<ProtectedRoute><CasingTubingDesignPro /></ProtectedRoute>} />
              <Route path="/dashboard/apps/drilling/directional-drilling-planner" element={<ProtectedRoute><DirectionalDrillingPlanner /></ProtectedRoute>} />
              <Route path="/dashboard/apps/drilling/mud-system-designer" element={<ProtectedRoute><MudSystemDesigner /></ProtectedRoute>} />

              {/* Production Apps */}
              <Route path="/dashboard/apps/production/production-surveillance-dashboard" element={<ProtectedRoute><ProductionSurveillanceDashboard /></ProtectedRoute>} />
              <Route path="/dashboard/apps/production/artificial-lift-designer" element={<ProtectedRoute><ArtificialLiftDesigner /></ProtectedRoute>} />
              <Route path="/dashboard/apps/production/flow-assurance-studio" element={<ProtectedRoute><FlowAssuranceStudio /></ProtectedRoute>} />
              <Route path="/dashboard/apps/production/reservoir-surveillance-studio" element={<ProtectedRoute><ReservoirSurveillanceStudio /></ProtectedRoute>} />

              {/* Economics Apps */}
              <Route path="/dashboard/apps/economics-project-management/afe-cost-control-manager" element={<ProtectedRoute><AfeCostControlManager /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/technical-report-autopilot" element={<ProtectedRoute><TechnicalReportAutopilot /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/probabilistic-breakeven-analyzer" element={<ProtectedRoute><ProbabilisticBreakevenAnalyzer /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/value-of-information-analyzer" element={<ProtectedRoute><ValueOfInformationAnalyzer /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/petroleum-economics-studio" element={<ProtectedRoute><PetroleumEconomicsStudio /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/epe-suite" element={<ProtectedRoute><EPESuite /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics/epe/cases" element={<ProtectedRoute><EpeCaseList /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics/epe/cases/:caseId" element={<ProtectedRoute><EpeCaseDetail /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics/epe/run/:runId" element={<ProtectedRoute><EpeRunConsole /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics/epe/results/:runId" element={<ProtectedRoute><EpeResultsViewer /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics/epe/compare" element={<ProtectedRoute><EpeRunComparison /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/irr-analysis" element={<ProtectedRoute><IRRAnalysis /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/npv-calculator" element={<ProtectedRoute><NPVCalculator /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/fiscal-regime-designer" element={<ProtectedRoute><FiscalRegimeDesigner /></ProtectedRoute>} />

              {/* Facilities Apps */}
              <Route path="/dashboard/apps/facilities/pipeline-designer" element={<ProtectedRoute><PipelineDesigner /></ProtectedRoute>} />
              <Route path="/dashboard/apps/facilities/produced-water-treatment" element={<ProtectedRoute><ProducedWaterTreatment /></ProtectedRoute>} />
              <Route path="/dashboard/apps/facilities/facilities-layout-designer" element={<ProtectedRoute><FacilitiesLayoutDesigner /></ProtectedRoute>} />
              <Route path="/dashboard/apps/facilities/facility-master-planner" element={<ProtectedRoute><FacilityMasterPlanner /></ProtectedRoute>} />
              <Route path="/dashboard/apps/facilities/hydraulics-simulator" element={<ProtectedRoute><HydraulicsSimulator /></ProtectedRoute>} />
              <Route path="/dashboard/apps/facilities/network-optimization" element={<ProtectedRoute><NetworkOptimization /></ProtectedRoute>} />
              <Route path="/dashboard/apps/facilities/nodal-analysis" element={<ProtectedRoute><NodalAnalysis /></ProtectedRoute>} />

              {/* HSE/Assurance Apps */}
              <Route path="/dashboard/apps/assurance/risk-heatmap" element={<ProtectedRoute><RiskHeatmap /></ProtectedRoute>} />
              <Route path="/dashboard/apps/assurance/risk-register" element={<ProtectedRoute><RiskRegister /></ProtectedRoute>} />
              <Route path="/dashboard/apps/assurance/management-of-change" element={<ProtectedRoute><ManagementOfChange /></ProtectedRoute>} />
              <Route path="/dashboard/apps/assurance/document-control" element={<ProtectedRoute><DocumentControl /></ProtectedRoute>} />
              <Route path="/dashboard/apps/assurance/compliance-tracker" element={<ProtectedRoute><ComplianceTracker /></ProtectedRoute>} />
              <Route path="/dashboard/apps/assurance/incident-reporting" element={<ProtectedRoute><IncidentReporting /></ProtectedRoute>} />
              <Route path="/dashboard/apps/assurance/emergency-response-planner" element={<ProtectedRoute><EmergencyResponsePlanner /></ProtectedRoute>} />
              <Route path="/dashboard/apps/assurance/environmental-monitoring" element={<ProtectedRoute><EnvironmentalMonitoring /></ProtectedRoute>} />
              <Route path="/dashboard/apps/assurance/safety-case-manager" element={<ProtectedRoute><SafetyCaseManager /></ProtectedRoute>} />

              {/* Project Management Apps */}
              <Route path="/dashboard/apps/economics-project-management/project-management-pro" element={<ProtectedRoute><ProjectManagementPro /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/risk-management-matrix" element={<ProtectedRoute><RiskManagementMatrix /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/schedule-optimizer" element={<ProtectedRoute><ScheduleOptimizer /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/cost-control-dashboard" element={<ProtectedRoute><CostControlDashboard /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/resource-planning-tool" element={<ProtectedRoute><ResourcePlanningTool /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/quality-assurance-tracker" element={<ProtectedRoute><QualityAssuranceTracker /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/stakeholder-engagement-portal" element={<ProtectedRoute><StakeholderEngagementPortal /></ProtectedRoute>} />
              <Route path="/dashboard/apps/economics-project-management/lessons-learned-database" element={<ProtectedRoute><LessonsLearnedDatabase /></ProtectedRoute>} />

              {/* Catch-all routes */}
              <Route path="/dashboard/*" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <Toaster />
        </div>
      </Router>
    </SupabaseAuthProvider>
  );
}

export default App;