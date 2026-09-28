import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, HeartHandshake, Megaphone, Target } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon }) => (
    <Card>
        <CardContent className="p-4 flex justify-between items-center">
            <div>
                <p className="text-xs text-pl-muted uppercase font-medium">{title}</p>
                <h3 className="text-2xl font-bold text-pl-text mt-1">{value}</h3>
            </div>
            <div className="p-2 rounded-full bg-pl-sunken">
                <Icon className="w-5 h-5 text-pl-muted" />
            </div>
        </CardContent>
    </Card>
);

const CommunityOverview = ({ data }) => {
    const { stakeholders = [], grievances = [], employment } = data;
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard 
                title="Stakeholders" 
                value={stakeholders.length} 
                icon={Users} 
            />
            {/* EC6-0: this read a literal 12 on every plan. It counts the
                engagements the plan carries. */}
            <StatCard 
                title="Engagements" 
                value={Array.isArray(data?.engagements) ? data.engagements.length : 0}
                icon={HeartHandshake} 
            />
            <StatCard 
                title="Open Grievances" 
                value={grievances.length} 
                icon={Megaphone} 
            />
            <StatCard 
                title="Local Content" 
                value={`${employment?.localContentTarget || 0}%`} 
                icon={Target} 
            />
        </div>
    );
};

export default CommunityOverview;