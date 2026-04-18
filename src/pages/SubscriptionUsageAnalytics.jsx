import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Placeholder for analytics charts - normally would use Recharts or similar
export default function SubscriptionUsageAnalytics() {
  const navigate = useNavigate();

  return (
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-white">
        <div className="flex items-center gap-2 mb-6 text-slate-400 cursor-pointer hover:text-white" onClick={() => navigate('/dashboard/subscriptions')}>
            <ArrowLeft className="w-4 h-4"/> Back to Subscriptions
        </div>
        
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
            <BarChart2 className="w-8 h-8 text-blue-400"/> Usage Analytics
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle className="text-lg">Total Active Users</CardTitle></CardHeader>
                <CardContent><p className="text-4xl font-bold text-blue-400">124</p></CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle className="text-lg">Storage Used</CardTitle></CardHeader>
                <CardContent><p className="text-4xl font-bold text-purple-400">450 GB</p></CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle className="text-lg">API Calls (This Month)</CardTitle></CardHeader>
                <CardContent><p className="text-4xl font-bold text-green-400">1.2M</p></CardContent>
            </Card>
        </div>

        <Card className="bg-slate-900 border-slate-800 h-96 flex items-center justify-center">
            <p className="text-slate-500 italic">Usage trends chart visualization would render here.</p>
        </Card>
    </div>
  );
}