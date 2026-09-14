import { Rocket, Gauge, Briefcase, Activity, BarChart3, Layers, Calculator, FileText, Shield, AlertTriangle, Settings, BookOpen, Video, Zap, Globe, Percent } from 'lucide-react';

export const HELP_CATEGORIES = [
  { id: 'quick-start', title: 'Quick Start', icon: Rocket, description: 'Get up and running in minutes.' },
  { id: 'quick-mode', title: 'Quick Mode', icon: Zap, description: 'Rapid evaluations for single wells.' },
  { id: 'expert-mode', title: 'Expert Mode', icon: Calculator, description: 'Detailed cashflow modeling.' },
  { id: 'scenarios', title: 'Scenario Building', icon: Layers, description: 'Manage Base, High, and Low cases.' },
  { id: 'sensitivity', title: 'Sensitivity Analysis', icon: Activity, description: 'Tornado charts and spider plots.' },
  { id: 'risk', title: 'Monte Carlo & Risk', icon: Percent, description: 'Seeded probabilistic simulation and the low, best and high NPV cases.' },
  { id: 'portfolio', title: 'Portfolio Analysis', icon: Briefcase, description: 'Aggregated views and ranking.' },
  { id: 'integration', title: 'Integration', icon: Globe, description: 'Connecting to other apps.' },
  { id: 'governance', title: 'Governance', icon: Shield, description: 'Approvals and permissions.' },
  { id: 'admin', title: 'Admin Guide', icon: Settings, description: 'Configuration and templates.' },
];

export const HELP_ARTICLES = [
  // Quick Start
  {
    id: 'getting-started',
    categoryId: 'quick-start',
    title: 'Quick Start Guide',
    content: `
      <h2>Welcome to NPV Scenario Builder</h2>
      <p>This tool is designed to help you perform comprehensive economic evaluations of oil and gas projects, from quick screening to detailed final investment decisions (FID).</p>
      <h3>Step 1: Choose Your Mode</h3>
      <p>Use <strong>Quick Mode</strong> for rapid screening using simplified inputs (e.g., "100 MMbbls" and "$50/bbl"). Use <strong>Expert Mode</strong> for detailed year-by-year modeling.</p>
      <h3>Step 2: Input Data</h3>
      <p>Enter your production profiles, price decks, CAPEX, and OPEX. You can also import data from other apps like Decline Curve Analysis.</p>
      <h3>Step 3: Analyze</h3>
      <p>Click <strong>Calculate</strong> to generate NPV, IRR, Payback, and Max Exposure metrics. View the Dashboard tab for key KPIs.</p>
      <h3>Step 4: Scenarios & Risk</h3>
      <p>The system automatically generates Low and High scenarios. Use the Risk tab to run Monte Carlo simulations.</p>
    `
  },
  // Quick Mode
  {
    id: 'quick-mode-guide',
    categoryId: 'quick-mode',
    title: 'Quick Mode User Guide',
    content: `
      <p>Quick Mode is perfect for "back of the napkin" calculations or early-stage prospect screening.</p>
      <h3>Inputs</h3>
      <ul>
        <li><strong>Initial Rate & Decline:</strong> Uses an exponential decline model to generate a production profile.</li>
        <li><strong>Reserves:</strong> Alternatively, input total recoverable reserves and a project life.</li>
        <li><strong>Costs:</strong> Enter single values for Total CAPEX and OPEX/bbl. The system spreads CAPEX over the first 2 years.</li>
        <li><strong>Fiscal:</strong> Simplified Tax + Royalty model.</li>
      </ul>
      <h3>Results</h3>
      <p>Provides an immediate estimate of NPV and IRR. Note that Quick Mode results are approximations and should be verified in Expert Mode for FID.</p>
    `
  },
  // Expert Mode
  {
    id: 'expert-mode-guide',
    categoryId: 'expert-mode',
    title: 'Expert Mode User Guide',
    content: `
      <p>Expert Mode offers full control over every aspect of the economic model.</p>
      <h3>Production</h3>
      <p>Enter year-by-year volumes for Oil, Gas, and Water. You can copy-paste from Excel or import from Reservoir Engineering apps.</p>
      <h3>Price Deck</h3>
      <p>Configure complex price scenarios, including escalations, inflation, and price differentials (e.g., Brent vs WTI).</p>
      <h3>Costs (CAPEX/OPEX)</h3>
      <p>Detailed cost categorization: Drilling, Facilities, Pipeline, Fixed OPEX, Variable OPEX, and Abandonment (ABEX).</p>
      <h3>Fiscal Terms</h3>
      <p>Choose between <strong>Tax & Royalty</strong> or <strong>PSC (Production Sharing Contract)</strong>. Configure cost recovery limits, profit oil splits, and sliding scales.</p>
    `
  },
  // Scenarios
  {
    id: 'scenario-building',
    categoryId: 'scenarios',
    title: 'Building Scenarios',
    content: `
      <p>Scenarios help you understand the range of possible outcomes.</p>
      <h3>Standard Scenarios</h3>
      <ul>
        <li><strong>Base Case:</strong> Your most likely estimate.</li>
        <li><strong>Low Case:</strong> Pessimistic view (e.g., -20% Price, -20% Production, +20% Cost).</li>
        <li><strong>High Case:</strong> Optimistic view (e.g., +20% Price, +20% Production, -20% Cost).</li>
      </ul>
      <h3>Custom Scenarios</h3>
      <p>Create specific scenarios for "Price Crash", "Regulatory Change", or "Schedule Delay". Compare them side-by-side in the <strong>Scenarios</strong> tab.</p>
    `
  },
  // Sensitivity
  {
    id: 'sensitivity-analysis',
    categoryId: 'sensitivity',
    title: 'Sensitivity Analysis',
    content: `
      <p>Identify which variables have the biggest impact on your project value.</p>
      <h3>Tornado Chart</h3>
      <p>Shows the swing in NPV when each individual parameter (Price, CAPEX, OPEX, Production) is varied by ±30%.</p>
      <h3>Spider Plot</h3>
      <p>Visualizes the sensitivity curves. Steeper slopes indicate higher sensitivity. Flat lines indicate low impact.</p>
      <h3>Interpretation</h3>
      <p>If your project is highly sensitive to Oil Price but insensitive to CAPEX, focus your risk mitigation on hedging strategies rather than cost cutting.</p>
    `
  },
  // Monte Carlo
  {
    id: 'monte-carlo',
    categoryId: 'risk',
    title: 'Monte Carlo Simulation',
    content: `
      <p>Move beyond deterministic cases to probabilistic analysis.</p>
      <h3>How it Works</h3>
      <p>The system runs 1,000 iterations, sampling price, reserves and capex uniformly within plus or minus 20 percent of the base case.</p>
      <p>Every run is seeded. The default seed is 20260829 and the seed is shown with the results, so the same inputs and the same seed reproduce the same numbers exactly.</p>
      <h3>Key Metrics</h3>
      <p>The NPV cases follow the Suite percentile convention: a P-label is the probability that the NPV meets or exceeds the value, per SPE PRMS, and the cases are shown low to high.</p>
      <ul>
        <li><strong>Low case P90:</strong> a 90% probability the NPV meets or exceeds this value. It is the 10th percentile of the simulated NPVs.</li>
        <li><strong>Best case P50:</strong> the median NPV.</li>
        <li><strong>High case P10:</strong> a 10% probability the NPV meets or exceeds this value. It is the 90th percentile of the simulated NPVs.</li>
        <li><strong>EMV:</strong> Expected Monetary Value, the mean of all outcomes.</li>
      </ul>
      <h3>Charts</h3>
      <p>Use the Histogram to see the spread of outcomes and the S-Curve (Cumulative Probability) to determine the likelihood of a positive NPV.</p>
    `
  },
  // Portfolio
  {
    id: 'portfolio-analysis',
    categoryId: 'portfolio',
    title: 'Portfolio Management',
    content: `
      <p>View and manage multiple projects at an organizational level.</p>
      <h3>Rollup Metrics</h3>
      <p>See total Portfolio NPV, total CAPEX exposure, and aggregate production profiles.</p>
      <h3>Capital Efficiency</h3>
      <p>Rank projects by <strong>NPV/Investment (PIR)</strong> to prioritize capital allocation. Projects in the top-right of the scatter plot (High NPV, Low CAPEX) are your "Jewels".</p>
      <h3>Risked vs. Unrisked</h3>
      <p>Toggle between Risked (multiplied by Chance of Success) and Unrisked values to see the true portfolio value.</p>
    `
  },
  // Integration
  {
    id: 'integration-guide',
    categoryId: 'integration',
    title: 'Integration Guide',
    content: `
      <p>Seamlessly connect data from other Petrolord apps.</p>
      <h3>Supported Integrations</h3>
      <ul>
        <li><strong>Material Balance:</strong> Import production profiles directly.</li>
        <li><strong>Decline Curve Analysis:</strong> Sync forecasted decline rates.</li>
        <li><strong>AFE Manager:</strong> Pull live CAPEX estimates and actuals.</li>
        <li><strong>Project Management Pro:</strong> Sync schedule start dates and risk registers.</li>
      </ul>
      <h3>Data Lineage</h3>
      <p>Check the <strong>Integration Hub</strong> to see when data was last synced and which source it came from.</p>
    `
  }
];

export const FAQS = [
  { q: 'What discount rate is used for NPV?', a: 'The default is 10%, but you can change this in the Input Panel under "Economic Parameters".' },
  { q: 'Can I use my own fiscal regime?', a: 'Yes, in Expert Mode you can select "Custom Fiscal" and define specific royalty and tax rates.' },
  { q: 'How do I export to Excel?', a: 'Click the "Export" button in the Results Panel. This will generate a multi-sheet Excel file with summary, cashflow, and scenario data.' },
  { q: 'Why is my IRR zero?', a: 'If the total cashflow is never positive (i.e., the project never pays back), IRR cannot be calculated or is effectively negative.' },
  { q: 'Is inflation included?', a: 'By default, the model is Real terms (constant dollars). You can enable inflation in Expert Mode to run Nominal terms.' }
];

export const GLOSSARY = [
  { term: 'NPV', def: 'Net Present Value. The sum of discounted future cash flows. Represents the value created by the project.' },
  { term: 'IRR', def: 'Internal Rate of Return. The discount rate at which NPV equals zero. Represents the project\'s yield.' },
  { term: 'Payback Period', def: 'The time required for cumulative cash flow to turn positive.' },
  { term: 'Max Exposure', def: 'The maximum negative cumulative cash flow (peak capital at risk).' },
  { term: 'Fiscal Regime', def: 'The set of laws, regulations, and agreements governing the economic relationship between the government and the oil company.' },
  { term: 'Royalty', def: 'A payment to the government based on a percentage of gross revenue, usually taken off the top before costs.' },
  { term: 'Cost Recovery', def: 'In PSCs, the mechanism allowing contractors to recover their costs from a portion of production before profit sharing.' },
  { term: 'EMV', def: 'Expected Monetary Value. The probability-weighted average of all possible outcomes.' }
];

export const VIDEOS = [
  { id: 1, title: 'Quick Mode Walkthrough', duration: '5:00', thumbnail: 'bg-emerald-600', level: 'Beginner' },
  { id: 2, title: 'Building Complex Fiscal Regimes', duration: '12:15', thumbnail: 'bg-blue-600', level: 'Expert' },
  { id: 3, title: 'Mastering Monte Carlo Analysis', duration: '8:45', thumbnail: 'bg-purple-600', level: 'Advanced' },
  { id: 4, title: 'Portfolio Optimization Strategies', duration: '10:30', thumbnail: 'bg-amber-600', level: 'Advanced' },
  { id: 5, title: 'Exporting & Reporting', duration: '4:20', thumbnail: 'bg-slate-600', level: 'Beginner' }
];