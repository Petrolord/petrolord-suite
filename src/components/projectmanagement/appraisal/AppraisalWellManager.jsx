import React from 'react';
import { Activity, Database, Hammer as Drill } from 'lucide-react';
import NotTracked from '../NotTracked';

/**
 * The appraisal Wells tab.
 *
 * W7F. This tab printed three made-up wells (Appraisal-1 to -3 on "Ocean
 * Apex", with depths, test results and a "v2.1" static model) for every
 * appraisal project any user opened. The studio has no well records linked
 * to a project, so each panel now says what it would track and that none of
 * it is tracked yet, in the same way as the other project-type panels.
 */
export const AppraisalWellManager = () => (
    <div className="space-y-6" data-testid="appraisal-wells-not-tracked">
        <NotTracked
            title="Well Status & Drilling Tracking"
            icon={Drill}
            tracks={['Well name and trajectory type', 'Drilling status and current depth', 'Rig assignment']}
        />
        <NotTracked
            title="Well Testing & Results"
            icon={Activity}
            tracks={['Tests planned per well (DST, wireline sampling)', 'Results status', 'Key findings']}
        />
        <NotTracked
            title="Reservoir Characterization Status"
            icon={Database}
            tracks={['Static model version', 'Fluid analysis (PVT)', 'Dynamic model']}
        />
    </div>
);
