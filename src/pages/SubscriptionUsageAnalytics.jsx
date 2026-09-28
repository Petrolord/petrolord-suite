import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart2 } from 'lucide-react';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

// Placeholder for analytics charts - normally would use Recharts or similar
function SubscriptionUsageAnalyticsPage() {
  return (
    <AccountPage>
        <AccountHeader
            eyebrow="Subscriptions"
            title="Usage Analytics"
            icon={BarChart2}
            backTo="/dashboard/subscriptions"
            backLabel="Back to Subscriptions"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatTile label="Total Active Users" value="124" />
            <StatTile label="Storage Used" value="450" unit="GB" />
            <StatTile label="API Calls (This Month)" value="1.2M" />
        </div>

        <Card className="h-96 flex flex-col">
            <CardHeader><CardTitle className="text-lg">Usage trends</CardTitle></CardHeader>
            <CardContent className="flex flex-1 items-center justify-center">
                <p className="text-pl-muted italic">Usage trends chart visualization would render here.</p>
            </CardContent>
        </Card>
    </AccountPage>
  );
}

// Design system rollout batch 1E: the page wraps itself in <ThemedApp>.
export default function SubscriptionUsageAnalytics() {
  return (
    <AccountScope testId="subscription-usage-theme-scope">
      <SubscriptionUsageAnalyticsPage />
    </AccountScope>
  );
}
