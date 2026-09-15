import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, HeartHandshake, Megaphone, Target } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, colorClass }) => (
    <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-4 flex justify-between items-center">
            <div>
                <p className="text-xs text-slate-400 uppercase font-medium">{title}</p>
                <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
            </div>
            <div className={`p-2 rounded-full ${colorClass} bg-opacity-10`}>
                <Icon className={`w-5 h-5 ${colorClass.replace('bg-', 'text-')}`} />
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
                colorClass="bg-blue-500"
            />
            {/* EC6-0: this read a literal 12 on every plan. It counts the
                engagements the plan carries. */}
            <StatCard 
                title="Engagements" 
                value={Array.isArray(data?.engagements) ? data.engagements.length : 0}
                icon={HeartHandshake} 
                colorClass="bg-purple-500"
            />
            <StatCard 
                title="Open Grievances" 
                value={grievances.length} 
                icon={Megaphone} 
                colorClass="bg-yellow-500"
            />
            <StatCard 
                title="Local Content" 
                value={`${employment?.localContentTarget || 0}%`} 
                icon={Target} 
                colorClass="bg-green-500"
            />
        </div>
    );
};

export default CommunityOverview;