import React from 'react';
import { Card } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart2, Activity } from 'lucide-react';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

function AppAnalyticsPage() {
  // Placeholder for analytics dashboard
  // In a real implementation, this would fetch data from `app_analytics_daily` table
  // and use a charting library like Recharts.
  return (
    <AccountPage>
        <AccountHeader
            eyebrow="Administration"
            icon={BarChart2}
            title="App Analytics"
            description="Usage metrics and performance insights."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="Active Users (Today)" value="124" hint="+12% from yesterday" status="success" />
            <StatTile label="Total Sessions" value="450" hint="Last 24 hours" />
            <StatTile label="Avg. Duration" value="18m 30s" hint="Per session" />
            <StatTile label="Top App" value={<span className="font-pl-sans text-xl font-semibold">Geoscience Hub</span>} hint="45% of traffic" />
        </div>

        <Card className="h-96 flex items-center justify-center">
            <div className="text-center px-4">
                <Activity className="w-12 h-12 text-pl-muted mx-auto mb-4" aria-hidden="true" />
                <p className="text-pl-muted">Detailed usage charts would appear here.</p>
                <p className="text-xs text-pl-muted">(Recharts integration pending)</p>
            </div>
        </Card>
    </AccountPage>
  );
}

export default function AppAnalyticsDashboard() {
  return (
    <AccountScope testId="app-analytics-theme-scope">
      <AppAnalyticsPage />
    </AccountScope>
  );
}
