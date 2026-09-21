import { BookOpen, Layers, BarChart3, Smartphone, Plug, Settings, AlertTriangle, HelpCircle, Video, FileText } from 'lucide-react';

export const HELP_CATEGORIES = [
  { id: 'getting-started', title: 'Getting Started', icon: BookOpen, description: 'New to Project Management Pro? Start here.' },
  { id: 'project-management', title: 'Project Management', icon: Layers, description: 'Learn how to create and manage your projects.' },
  { id: 'portfolio-management', title: 'Portfolio Management', icon: BarChart3, description: 'High-level views and portfolio optimization.' },
  { id: 'analytics', title: 'Analytics & Reporting', icon: FileText, description: 'Deep dives into data, KPIs, and report generation.' },
  { id: 'mobile', title: 'Mobile App', icon: Smartphone, description: 'Using the companion mobile application.' },
  { id: 'integrations', title: 'Integrations', icon: Plug, description: 'What this studio can and cannot pull in from other apps.' },
  { id: 'admin', title: 'Admin & Settings', icon: Settings, description: 'User management and system configuration.' },
  { id: 'troubleshooting', title: 'Troubleshooting', icon: AlertTriangle, description: 'Solutions to common issues and errors.' },
];

export const HELP_ARTICLES = [
  // Getting Started
  {
    id: 'welcome',
    categoryId: 'getting-started',
    title: 'Welcome to Project Management Pro',
    content: `
      <h2>Welcome to the Future of Project Management</h2>
      <p>Project Management Pro is an integrated suite designed for the energy sector. It combines traditional project management disciplines with industry-specific workflows for Exploration, Appraisal, Development, and Decommissioning.</p>
      <h3>Key Capabilities</h3>
      <ul>
        <li><strong>Lifecycle Management:</strong> Track projects from Concept to Close-out.</li>
        <li><strong>Integrated Analytics:</strong> Real-time dashboards for Budget, Schedule, and Risk.</li>
        <li><strong>Risk Management:</strong> A probability and impact register with a five by five matrix. There is no Monte Carlo simulation in this app.</li>
        <li><strong>Resource Planning:</strong> Capacity planning and resource allocation tools.</li>
      </ul>
    `
  },
  {
    id: 'system-overview',
    categoryId: 'getting-started',
    title: 'System Overview',
    content: `
      <p>The system is divided into three main operational areas:</p>
      <h3>1. The Portfolio Dashboard</h3>
      <p>This is your command center. It provides a high-level view of all active projects, aggregated KPIs, and portfolio health status. Use this to identify outliers and allocate capital efficiently.</p>
      <h3>2. Project Workspace</h3>
      <p>Where the work gets done. Each project has its own dedicated workspace containing:</p>
      <ul>
        <li><strong>Gantt Chart:</strong> For schedule management.</li>
        <li><strong>Kanban Board:</strong> For task execution.</li>
        <li><strong>Risk Register:</strong> For identifying and mitigating threats.</li>
        <li><strong>Resource Plan:</strong> For staffing and cost estimation.</li>
      </ul>
      <h3>3. Analytics & Reporting Hub</h3>
      <p>Generate detailed PDF reports, view cumulative cost trends (S-Curves), and analyze Earned Value Management (EVM) metrics.</p>
    `
  },
  {
    id: 'first-project',
    categoryId: 'getting-started',
    title: 'Creating Your First Project',
    content: `
      <p>Follow these steps to launch your first project:</p>
      <ol>
        <li>Navigate to the <strong>Project Management Pro</strong> dashboard.</li>
        <li>In the left Input Panel, click the specific project type button (e.g., "New Exploration Project" or "New Field Dev Project").</li>
        <li>A wizard will appear. Enter the <strong>Project Name</strong>, <strong>Code</strong>, and <strong>Baseline Budget</strong>.</li>
        <li>Select the appropriate <strong>Asset</strong> and <strong>Country</strong>.</li>
        <li>Click <strong>Create Project</strong>.</li>
      </ol>
      <p>Once created, you will be redirected to the Project Dashboard where you can start adding tasks and milestones.</p>
    `
  },

  // Project Management
  {
    id: 'managing-tasks',
    categoryId: 'project-management',
    title: 'Managing Project Tasks',
    content: `
      <p>Tasks are the building blocks of your project. You can manage them in three views:</p>
      <h3>WBS View (Work Breakdown Structure)</h3>
      <p>Best for bulk editing and structuring. Use the table view to quickly add tasks, set dates, and assign owners. Use the arrow buttons to reorder tasks.</p>
      <h3>Gantt Chart</h3>
      <p>Best for visualizing timelines and dependencies. Drag and drop bars to adjust dates. Dependencies are visualized as connecting lines.</p>
      <h3>Kanban Board</h3>
      <p>Best for execution. Drag cards between "To Do", "In Progress", and "Done" to update status instantly.</p>
    `
  },
  {
    id: 'risk-management',
    categoryId: 'project-management',
    title: 'Risk Management',
    content: `
      <p>Effective risk management is crucial. Use the <strong>Risk Register</strong> to log potential threats.</p>
      <h3>Adding a Risk</h3>
      <ol>
        <li>Go to the <strong>Risks</strong> tab in your project dashboard.</li>
        <li>Click <strong>Add Risk</strong>.</li>
        <li>Define the <strong>Probability</strong> (1-5) and <strong>Impact</strong> (1-5). The system calculates the Risk Score automatically.</li>
        <li>Assign an <strong>Owner</strong> and a <strong>Mitigation Plan</strong>.</li>
      </ol>
      <p>Risks with a score > 15 are flagged as <strong>Critical</strong> and appear on the Executive Dashboard.</p>
    `
  },
  {
    id: 'resource-planning',
    categoryId: 'project-management',
    title: 'Resource Planning',
    content: `
      <p>Manage your team and equipment effectively.</p>
      <ul>
        <li><strong>Resource Pool:</strong> Define all available personnel and assets in the "Resources" tab.</li>
        <li><strong>Assignment:</strong> Assign resources to specific tasks. Enter their allocation % (e.g., 50% time).</li>
        <li><strong>Capacity Check:</strong> Use the "Capacity Dashboard" to spot over-allocation (highlighted in red).</li>
      </ul>
    `
  },

  // Analytics
  {
    id: 'evm-explained',
    categoryId: 'analytics',
    title: 'Earned Value Management (EVM)',
    content: `
      <p>We use standard EVM metrics to track performance:</p>
      <ul>
        <li><strong>PV (Planned Value):</strong> The budget of every task in scope. It is NOT time-phased here: nothing is measured against a date, so the schedule index below measures progress against the whole budget rather than against what should have been done by today.</li>
        <li><strong>EV (Earned Value):</strong> The budget associated with the authorized work that has been completed.</li>
        <li><strong>AC (Actual Cost):</strong> The actual cost incurred for the work completed.</li>
        <li><strong>CPI (Cost Performance Index):</strong> EV / AC. A value < 1.0 indicates a cost overrun.</li>
        <li><strong>SPI (Schedule Performance Index):</strong> EV / PV. On the time-phased definition a value below 1.0 means late; on the whole-budget planned value this app uses, it means the work is not finished yet. Use it as a completion ratio, and the AFE Cost Control Manager, which is measured against an as-of date, when you need a real schedule index.</li>
      </ul>
      <p>An index with no denominator is reported as not available rather than as 1.00: a project with no actual cost booked has no cost index, and a project with no costed task has no schedule index at all.</p>
    `
  },
  {
    id: 'report-builder',
    categoryId: 'analytics',
    title: 'Using the Report Builder',
    content: `
      <p>Create professional PDF reports for stakeholders.</p>
      <ol>
        <li>Click <strong>Export Report</strong> in the top right corner.</li>
        <li>Select the sections you want to include (Executive Summary, Financials, Risks, etc.).</li>
        <li>Choose the format (Monthly, Quarterly).</li>
        <li>Click <strong>Generate PDF</strong>.</li>
      </ol>
    `
  },

  // Mobile App
  {
    id: 'mobile-overview',
    categoryId: 'mobile',
    title: 'Mobile App Overview',
    content: `
      <p>The Project Management Pro mobile app allows you to manage projects on the go. It is available as a PWA (Progressive Web App).</p>
      <h3>Key Features</h3>
      <ul>
        <li><strong>Dashboard:</strong> View project health and critical alerts.</li>
        <li><strong>My Tasks:</strong> See tasks assigned specifically to you.</li>
        <li><strong>Offline Mode:</strong> View cached data when internet connectivity is lost. Syncs automatically when online.</li>
        <li><strong>Approvals:</strong> Approve gate passages and key deliverables directly from your phone.</li>
      </ul>
    `
  },

  // Integration
  {
    id: 'integration-hub',
    categoryId: 'integrations',
    title: 'Integration Hub',
    content: `
      <p>There is no live connection to another system from this app. Jira, SAP and Slack are not connected, and nothing is imported from them.</p>
      <p>The integration panels create deliverables and tasks in this project from your own click. They read nothing from the app they are named after.</p>
    `
  },
  
  // Troubleshooting
  {
    id: 'common-issues',
    categoryId: 'troubleshooting',
    title: 'Common Issues & Fixes',
    content: `
      <h3>Sync Failures</h3>
      <p>If data isn't syncing, check your internet connection. The app will retry automatically. If the issue persists, clear your browser cache.</p>
      <h3>PDF Export Issues</h3>
      <p>Ensure you have pop-ups enabled for this site. Large reports may take up to 30 seconds to generate.</p>
      <h3>Login Problems</h3>
      <p>If you cannot log in, use the "Forgot Password" link. For SSO issues, contact your IT administrator.</p>
    `
  }
];

export const FAQS = [
  { q: 'How do I delete a project?', a: 'Currently, project deletion is restricted to Admins. Contact support to request a deletion.' },
  { q: 'Can I export to Excel?', a: 'Yes, use the "Export" button in the WBS view to download a .xlsx file.' },
  { q: 'Is the data encrypted?', a: 'Yes, all data is encrypted at rest and in transit using industry-standard TLS 1.2+ protocols.' },
  { q: 'How often is the dashboard updated?', a: 'Dashboards update in real-time as changes are made by users.' },
  { q: 'Does the mobile app work offline?', a: 'Yes, the mobile app caches recent projects for offline viewing.' }
];

export const GLOSSARY = [
  { term: 'CPI', def: 'Cost Performance Index. A measure of the cost efficiency of budgeted resources expressed as the ratio of earned value to actual cost.' },
  { term: 'SPI', def: 'Schedule Performance Index. A measure of schedule efficiency expressed as the ratio of earned value to planned value.' },
  { term: 'WBS', def: 'Work Breakdown Structure. A hierarchical decomposition of the total scope of work to be carried out by the project team.' },
  { term: 'Risk Score', def: 'Calculated as Probability × Impact. Used to prioritize risk mitigation efforts.' },
  { term: 'Gate', def: 'A decision point in the project lifecycle where the project is reviewed and approved to proceed to the next stage.' },
  { term: 'Baseline', def: 'The original approved plan (budget and schedule) against which performance is measured.' }
];

export const TUTORIALS = [
  { id: 1, title: 'Getting Started in 5 Minutes', duration: '5:00', thumbnail: 'bg-blue-500' },
  { id: 2, title: 'Mastering the Gantt Chart', duration: '8:30', thumbnail: 'bg-purple-500' },
  { id: 3, title: 'Advanced Risk Management', duration: '6:15', thumbnail: 'bg-red-500' },
  { id: 4, title: 'Generating Custom Reports', duration: '4:45', thumbnail: 'bg-green-500' },
  { id: 5, title: 'Mobile App Walkthrough', duration: '3:20', thumbnail: 'bg-orange-500' }
];