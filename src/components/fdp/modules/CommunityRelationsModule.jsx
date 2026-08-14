import React from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';
import CommunityOverview from './community/CommunityOverview';
import StakeholderManager from './community/StakeholderManager';

const CommunityRelationsModule = () => {
    const { state, actions } = useFDP();
    const { communityData } = state;

    const updateCommunity = (key, value) => {
        actions.updateCommunity({ [key]: value });
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-4">
                <h2 className="text-2xl font-bold text-white">Community Relations</h2>
                <p className="text-slate-400">Manage social impact, stakeholders, and local content.</p>
            </div>

            <CollapsibleSection title="Overview" defaultOpen>
                <CommunityOverview data={communityData} />
            </CollapsibleSection>

            <CollapsibleSection title="Engagement Strategy" defaultOpen>
                <div className="space-y-4">
                     <div className="space-y-2">
                        <label className="text-sm text-slate-300">Core Engagement Strategy</label>
                        <Input 
                            value={communityData.strategy}
                            onChange={(e) => updateCommunity('strategy', e.target.value)}
                            className="bg-slate-800 border-slate-700"
                            placeholder="e.g. Proactive transparency and quarterly town halls"
                        />
                    </div>
                     <div className="space-y-2">
                        <label className="text-sm text-slate-300">Social Impact Assessment (SIA) Summary</label>
                        <Textarea 
                            value={communityData.impactAssessment}
                            onChange={(e) => updateCommunity('impactAssessment', e.target.value)}
                            className="bg-slate-800 border-slate-700 min-h-[100px]"
                            placeholder="Summary of key social impacts..."
                        />
                    </div>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Stakeholder Analysis" defaultOpen>
                <StakeholderManager 
                    stakeholders={communityData.stakeholders}
                    onUpdate={(updated) => updateCommunity('stakeholders', updated)}
                />
            </CollapsibleSection>

            <CollapsibleSection title="Local Content & Employment">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-sm text-slate-300">Local Employment Target (%)</label>
                         <Input 
                            type="number"
                            value={communityData.employment?.localContentTarget || 0}
                            onChange={(e) => updateCommunity('employment', { ...communityData.employment, localContentTarget: e.target.value })}
                            className="bg-slate-800 border-slate-700"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm text-slate-300">Community Development Projects</label>
                        <Textarea 
                            placeholder="Describe planned schools, clinics, or infrastructure projects..."
                            className="bg-slate-800 border-slate-700 min-h-[80px]"
                        />
                    </div>
                 </div>
            </CollapsibleSection>
        </div>
    );
};

export default CommunityRelationsModule;