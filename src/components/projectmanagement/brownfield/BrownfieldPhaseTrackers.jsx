/**
 * EC6-0: every tracker in this file printed a fixed progress percentage
 * and a set of figures written into the source, the same on every
 * project of this type. They name what they would track and say that the
 * studio does not track it; see components/projectmanagement/NotTracked.jsx.
 */
import React from 'react';
import { BarChart2, Layout, Lightbulb, TrendingUp } from 'lucide-react';
import NotTracked from '../NotTracked';

export const OpportunityIdentification = () => (
    <NotTracked
        title="Opportunity Assessment"
        icon={Lightbulb}
        tracks={['Screening', 'Business Case', 'ROI Estimate']}
    />
);

export const InfrastructureAssessment = () => (
    <NotTracked
        title="Existing Infrastructure"
        icon={Layout}
        tracks={['Piping Integrity', 'Structural Capacity', 'Control System']}
    />
);

export const BrownfieldOptimization = () => (
    <NotTracked
        title="Optimization Tracking"
        icon={TrendingUp}
        tracks={['Debottlenecking', 'Energy Efficiency', 'Cost Savings']}
    />
);

export const ProductionIncreaseTracking = () => (
    <NotTracked
        title="Production Uplift"
        icon={BarChart2}
        tracks={['Target Increase', 'Actual Increase', 'Cost per Barrel']}
    />
);
