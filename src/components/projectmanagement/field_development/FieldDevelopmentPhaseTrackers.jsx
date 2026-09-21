/**
 * EC6-0: every tracker in this file printed a fixed progress percentage
 * and a set of figures written into the source, the same on every
 * project of this type. They name what they would track and say that the
 * studio does not track it; see components/projectmanagement/NotTracked.jsx.
 */
import React from 'react';
import { DraftingCompass, Factory, HardHat, ShoppingCart, TrendingUp, Wrench } from 'lucide-react';
import NotTracked from '../NotTracked';

export const FEEDManagement = () => (
    <NotTracked
        title="FEED Management"
        icon={DraftingCompass}
        tracks={['BOD Approved', 'Cost Estimate', 'Hazop']}
    />
);

export const FacilitiesManagement = () => (
    <NotTracked
        title="Facilities Engineering"
        icon={Factory}
        tracks={['3D Model', 'P&IDs', 'Weight Control']}
    />
);

export const ProcurementManagement = () => (
    <NotTracked
        title="Procurement"
        icon={ShoppingCart}
        tracks={['Long Lead Items', 'Bulk Materials', 'Expediting']}
    />
);

export const ConstructionManagement = () => (
    <NotTracked
        title="Construction"
        icon={HardHat}
        tracks={['Site Works', 'Fabrication', 'Safety Incidents']}
    />
);

export const CommissioningManagement = () => (
    <NotTracked
        title="Commissioning"
        icon={Wrench}
        tracks={['Systemization', 'Checksheets', 'Walkdowns']}
    />
);

export const ProductionRampUpTracking = () => (
    <NotTracked
        title="Production Ramp-Up"
        icon={TrendingUp}
        tracks={['Target Rate', 'First Oil Date', 'Uptime Target']}
    />
);
