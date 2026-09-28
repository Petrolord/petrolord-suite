import React from 'react';
import { Card } from '@/components/ui/card';
import { BarChart2, Activity } from 'lucide-react';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

// The Suite does not record per-app usage yet. app_analytics_daily exists
// (with an org-admin read policy) but nothing writes to it, and it held no
// rows when checked on 2026-09-28. Until a real usage source is wired, this
// page says so plainly and shows no figures. It used to show fixed
// placeholder numbers (124 users, 450 sessions), which a customer could
// read as real.
function AppAnalyticsPage() {
  return (
    <AccountPage>
        <AccountHeader
            eyebrow="Administration"
            icon={BarChart2}
            title="App Analytics"
            description="Usage metrics and performance insights."
        />

        <Card className="flex min-h-[16rem] items-center justify-center" data-testid="app-analytics-empty">
            <div className="text-center px-4 py-10 max-w-md">
                <Activity className="w-12 h-12 text-pl-muted mx-auto mb-4" aria-hidden="true" />
                <p className="font-semibold text-pl-text">No usage data recorded yet</p>
                <p className="mt-2 text-sm text-pl-muted">
                    Active users, sessions and the most used apps will appear here once the Suite starts recording app usage for your organization.
                </p>
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
