import { 
    Layers3, Database, Workflow, DollarSign, Wrench, Search, Calculator, Target, 
    SplitSquareHorizontal, Beaker, LandPlot, Route, Waves, ScanSearch, Waypoints, 
    Scaling, HelpingHand, Sprout, Wind, Droplet, Fuel, HardHat, Lightbulb as Bolt, 
    Pipette, LayoutDashboard, Settings, Compass, Box, Package, Globe, Users, 
    TrendingUp, HeartHandshake as Handshake, Shield, Monitor, Briefcase, FileText, 
    CheckCircle, Lightbulb, Rocket, BarChart2, Zap, Cloud, Sun, Leaf, Factory, 
    Recycle, Activity, FlaskConical, CircleDollarSign, Coins, Scale, TrendingDown, 
    Eye, LightbulbOff, FlaskRound, Sparkles, Network, GaugeCircle as CircleGauge, 
    Gauge, Hammer, BadgeInfo as FactoryIcon, Calendar, BookOpen, UserCheck, Code, 
    Bell, UserPlus, FileUp, Files, TestTube, Thermometer, Droplets, Droplet as DropletIcon, 
    Component, Lightbulb as LightbulbIcon, Coins as HandCoins, Building, Building2, 
    HelpCircle, Upload, DraftingCompass, Tornado, Waves as WavesIcon, Filter, 
    FileClock, ShieldHalf, Footprints, Cylinder, Cuboid, ShieldCheck, AlertTriangle, 
    Grid, Dices, GitBranch, Layers, List, Lock, History, Map, CheckCircle2
} from 'lucide-react';

export const iconRegistry = {
    Layers3, Database, Workflow, DollarSign, Wrench, Search, Calculator, Target, 
    SplitSquareHorizontal, Beaker, LandPlot, Route, Waves, ScanSearch, Waypoints, 
    Scaling, HelpingHand, Sprout, Wind, Droplet, Fuel, HardHat, Bolt, 
    Pipette, LayoutDashboard, Settings, Compass, Box, Package, Globe, Users, 
    TrendingUp, Handshake, Shield, Monitor, Briefcase, FileText, 
    CheckCircle, Lightbulb, Rocket, BarChart2, Zap, Cloud, Sun, Leaf, Factory, 
    Recycle, Activity, FlaskConical, CircleDollarSign, Coins, Scale, TrendingDown, 
    Eye, LightbulbOff, FlaskRound, Sparkles, Network, CircleGauge, 
    Gauge, Hammer, FactoryIcon, Calendar, BookOpen, UserCheck, Code, 
    Bell, UserPlus, FileUp, Files, TestTube, Thermometer, Droplets, DropletIcon, 
    Component, LightbulbIcon, HandCoins, Building, Building2, 
    HelpCircle, Upload, DraftingCompass, Tornado, WavesIcon, Filter, 
    FileClock, ShieldHalf, Footprints, Cylinder, Cuboid, ShieldCheck, AlertTriangle, 
    Grid, Dices, GitBranch, Layers, List, Lock, History, Map, CheckCircle2
};

export const getAppIcon = (iconName) => {
    if (!iconName) return Box;
    return iconRegistry[iconName] || Box;
};

export const appCategories = [];

export const applications = [
    {
        id: 'seismic-interpretation-pro',
        slug: 'seismic-interpretation-pro',
        name: 'Seismic Interpretation Pro',
        description: 'SEG-Y upload, job monitoring, QC reports, volume registry, and preview viewer for seismic interpretation workflows',
        module: 'geoscience',
        path: '/dashboard/apps/geoscience/seismic-interpretation-pro',
        icon: 'Waves'
    },
    {
        id: 'petrophysical-integration-suite',
        slug: 'petrophysical-integration-suite',
        name: 'Petrophysical Integration Suite',
        description: 'Advanced petrophysical data integration, well log conditioning, and cross-domain workflows.',
        module: 'geoscience',
        path: '/dashboard/apps/geoscience/petrophysical-integration-suite',
        icon: 'Database'
    },
    {
        id: 'well-correlation-tool',
        slug: 'well-correlation-tool',
        name: 'Well Correlation Tool',
        description: 'Interactively correlate well logs, create cross-sections, and visualize subsurface data.',
        module: 'geoscience',
        path: '/dashboard/apps/geoscience/well-correlation-tool',
        icon: 'Activity'
    },
    {
        id: 'cementing-simulation',
        slug: 'cementing-simulation',
        name: 'Cementing Simulation App',
        description: 'High-fidelity cementing simulation for well integrity.',
        module: 'drilling',
        category: 'drilling',
        path: '/dashboard/apps/drilling/cementing-simulation',
        route: '/dashboard/apps/drilling/cementing-simulation',
        icon: 'Layers'
    },
    {
        id: 'production-surveillance-dashboard',
        slug: 'production-surveillance-dashboard',
        name: 'Production Surveillance Dashboard',
        description: 'Monitor, analyze, and report on daily production performance.',
        module: 'production',
        category: 'production',
        path: '/dashboard/apps/production/production-surveillance-dashboard',
        route: '/dashboard/apps/production/production-surveillance-dashboard',
        icon: 'LayoutDashboard'
    },
    {
        id: 'afe-cost-control-manager',
        slug: 'afe-cost-control-manager',
        name: 'AFE Cost Control Manager',
        description: 'Track, manage, and analyze Authorization for Expenditure (AFE) costs.',
        module: 'economics-project-management',
        category: 'economics',
        path: '/dashboard/apps/economics-project-management/afe-cost-control-manager',
        route: '/dashboard/apps/economics-project-management/afe-cost-control-manager',
        icon: 'CircleDollarSign'
    },
    {
        id: 'technical-report-autopilot',
        slug: 'technical-report-autopilot',
        name: 'Technical Report Autopilot',
        description: 'AI-powered generation of technical reports and documents for the energy sector.',
        module: 'economics-project-management',
        category: 'economics-project-management',
        path: '/dashboard/apps/economics-project-management/technical-report-autopilot',
        route: '/dashboard/apps/economics-project-management/technical-report-autopilot',
        icon: 'FileText'
    },
    {
        id: 'probabilistic-breakeven-analyzer',
        slug: 'probabilistic-breakeven-analyzer',
        name: 'Probabilistic Breakeven Analyzer',
        description: 'Risk-informed project viability analysis with Monte Carlo simulation for breakeven price/volume.',
        module: 'economics-project-management',
        category: 'economics-project-management',
        path: '/dashboard/apps/economics-project-management/probabilistic-breakeven-analyzer',
        route: '/dashboard/apps/economics-project-management/probabilistic-breakeven-analyzer',
        icon: 'TrendingUp'
    },
    {
        id: 'value-of-information-analyzer',
        slug: 'value-of-information-analyzer',
        name: 'Value of Information Analyzer',
        description: 'Advanced Value of Information (VOI) analysis for oil and gas projects.',
        module: 'economics-project-management',
        category: 'economics-project-management',
        path: '/dashboard/apps/economics-project-management/value-of-information-analyzer',
        route: '/dashboard/apps/economics-project-management/value-of-information-analyzer',
        icon: 'Target'
    },
    {
        id: 'epe-suite',
        slug: 'epe-suite',
        name: 'EPE Suite',
        description: 'Economic Planning & Evaluation Suite for comprehensive case management and comparison.',
        module: 'economics-project-management',
        category: 'economics-project-management',
        path: '/dashboard/apps/economics/epe/cases',
        route: '/dashboard/apps/economics/epe/cases',
        icon: 'Briefcase'
    },
    {
        id: 'petroleum-economics-studio',
        slug: 'petroleum-economics-studio',
        name: 'Petroleum Economics Studio',
        description: 'Comprehensive economic modeling, fiscal regime design, and portfolio optimization tool.',
        module: 'economics-project-management',
        category: 'economics-project-management',
        path: '/dashboard/apps/economics-project-management/petroleum-economics-studio',
        route: '/dashboard/apps/economics-project-management/petroleum-economics-studio',
        icon: 'DollarSign'
    },
    {
        id: 'pipeline-designer',
        slug: 'pipeline-designer',
        name: 'Pipeline Designer',
        description: 'End-to-end pipeline hydraulics, sizing, and flow assurance.',
        module: 'facilities',
        category: 'facilities',
        path: '/dashboard/apps/facilities/pipeline-designer',
        route: '/dashboard/apps/facilities/pipeline-designer',
        icon: 'Route'
    },
    {
        id: 'produced-water-treatment',
        slug: 'produced-water-treatment',
        name: 'Produced Water Treatment',
        description: 'Design and model produced water treatment trains including hydrocyclones, CPI, IGF, and DAF systems.',
        module: 'facilities',
        category: 'facilities',
        path: '/dashboard/apps/facilities/produced-water-treatment',
        route: '/dashboard/apps/facilities/produced-water-treatment',
        icon: 'Droplets'
    },
    {
        id: 'risk-register',
        slug: 'risk-register',
        name: 'Risk Register',
        description: 'Centralized tracking and management of all organizational risks, mitigations, and statuses.',
        module: 'assurance',
        category: 'assurance',
        path: '/dashboard/apps/assurance/risk-register',
        route: '/dashboard/apps/assurance/risk-register',
        icon: 'List'
    },
    {
        id: 'management-of-change',
        slug: 'management-of-change',
        name: 'Management of Change',
        description: 'Structured workflow for proposing, evaluating, and implementing operational changes securely.',
        module: 'assurance',
        category: 'assurance',
        path: '/dashboard/apps/assurance/management-of-change',
        route: '/dashboard/apps/assurance/management-of-change',
        icon: 'GitBranch',
        isComingSoon: false,
        is_built: true
    },
    {
        id: 'document-control',
        slug: 'document-control',
        name: 'Document Control',
        description: 'Secure, version-controlled repository for all critical operational and compliance documents.',
        module: 'assurance',
        category: 'assurance',
        path: '/dashboard/apps/assurance/document-control',
        route: '/dashboard/apps/assurance/document-control',
        icon: 'Files'
    },
    {
        id: 'peer-review-manager',
        slug: 'peer-review-manager',
        name: 'Peer Review Manager',
        description: 'Streamline the technical peer review process to ensure decision quality and rigor.',
        module: 'assurance',
        category: 'assurance',
        path: '/dashboard/apps/assurance/peer-review-manager',
        route: '/dashboard/apps/assurance/peer-review-manager',
        icon: 'Users',
        isComingSoon: false,
        is_built: true
    },
    {
        id: 'qa-plan',
        slug: 'qa-plan',
        name: 'Quality Assurance Plan',
        description: 'Define, manage, monitor, and prove quality requirements from planning to close-out',
        module: 'assurance',
        category: 'assurance',
        path: '/dashboard/apps/assurance/qa-plan',
        route: '/dashboard/apps/assurance/qa-plan',
        icon: 'CheckCircle',
        status: 'is built',
        color: 'emerald',
        isComingSoon: false,
        is_built: true
    },
    {
        id: 'lessons-learned',
        name: 'Lessons Learned',
        description: 'Capture, validate, classify, and reuse lessons from projects, operations, and events to improve future decisions and preserve institutional knowledge',
        icon: 'BookOpen',
        module: 'assurance',
        status: 'is built',
        route: '/dashboard/apps/assurance/lessons-learned',
        color: 'blue',
        isComingSoon: false,
        is_built: true
    },
    {
        id: 'regulatory-compliance',
        name: 'Regulatory Compliance',
        description: 'Identify, track, manage, evidence, and report compliance obligations across operations, studies, facilities, drilling, production, HSE, commercial, and corporate governance activities',
        icon: 'Shield',
        module: 'assurance',
        status: 'is built',
        route: '/dashboard/apps/assurance/regulatory-compliance',
        color: 'amber',
        isComingSoon: false,
        is_built: true
    },
    {
        id: 'iso-compliance',
        name: 'ISO Compliance',
        description: 'Manage compliance with ISO-based management systems in a structured and auditable way. Support clause mapping, evidence tracking, internal audits, findings, corrective actions, and certification readiness',
        icon: 'CheckCircle2',
        module: 'assurance',
        status: 'is built',
        route: '/dashboard/apps/assurance/iso-compliance',
        color: 'blue'
    }
];

export const getAppById = (id) => {
    if (!id) return undefined;
    return applications.find(app => app.id === id || app.slug === id);
};