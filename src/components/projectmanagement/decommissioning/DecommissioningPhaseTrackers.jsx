/**
 * EC6-0: every tracker in this file printed a fixed progress percentage
 * and a set of figures written into the source, the same on every
 * project of this type. They name what they would track and say that the
 * studio does not track it; see components/projectmanagement/NotTracked.jsx.
 */
import React from 'react';
import { Anchor, CheckSquare, Recycle, Scale, Sprout, Trash } from 'lucide-react';
import NotTracked from '../NotTracked';

export const WellAbandonmentManagement = () => (
    <NotTracked
        title="Well Abandonment"
        icon={Trash}
        tracks={['Wells Plugged', 'Rig Utilization', 'Cost per Well']}
    />
);

export const FacilityRemovalManagement = () => (
    <NotTracked
        title="Facility Removal"
        icon={Anchor}
        tracks={['HLV Contracted', 'Topsides Weight', 'Lifting Plan']}
    />
);

export const SiteRemediationManagement = () => (
    <NotTracked
        title="Site Remediation"
        icon={Sprout}
        tracks={['Debris Survey', 'Seabed Clearance', 'Sampling Plan']}
    />
);

export const EnvironmentalMonitoring = () => (
    <NotTracked
        title="Environmental Monitoring"
        icon={Scale}
        tracks={['Baseline Survey', 'Monitoring Events', 'Compliance']}
    />
);

export const RegulatoryComplianceTracking = () => (
    <NotTracked
        title="Regulatory Compliance"
        icon={CheckSquare}
        tracks={['Decom Plan', 'Permits Active', 'Inspections']}
    />
);

export const WasteManagementTracking = () => (
    <NotTracked
        title="Waste Management"
        icon={Recycle}
        tracks={['Total Waste', 'Recycling Rate', 'HazMat Disposal']}
    />
);
