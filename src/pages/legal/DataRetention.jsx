import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const DataRetention = () => {
  return (
    <>
      <Helmet>
        <title>Data Retention and Offboarding - Petrolord</title>
        <meta name="description" content="How Petrolord handles data ownership, export, account closure, deletion and retention." />
      </Helmet>
      <div className="min-h-screen bg-slate-900 text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Button asChild variant="outline" className="bg-slate-800 border-slate-700 hover:bg-slate-700">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Link>
            </Button>
          </div>
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-4xl font-bold text-lime-300 tracking-tight">Data Retention and Offboarding</CardTitle>
              <p className="text-slate-400 mt-2">Last Updated: August 5, 2026</p>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[60vh] pr-6">
                <div className="space-y-6 text-slate-300 prose prose-invert prose-p:leading-relaxed">
                  <section>
                    <h2 className="text-xl font-semibold text-white">1. Your data belongs to you</h2>
                    <p>
                      Everything your organization creates on Petrolord, including projects, wells,
                      interpretations, uploaded files and results, remains your property. We process
                      it only to provide the service. Access to your data is isolated per organization
                      at the database level, so no other customer can ever read it.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-white">2. Export at any time</h2>
                    <p>
                      Organization administrators can download a complete copy of their
                      organization&apos;s data at any time from Dashboard, then Data Export. An export
                      contains every database record the organization owns as JSON files in a single
                      zip, plus a manifest of large stored files such as seismic volumes and well
                      log curves, each downloadable through secure time-limited links. Security
                      credentials and tokens are never included in exports. You do not need to be
                      leaving to use this; it also works as an off-platform backup.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-white">3. Closing your account</h2>
                    <p>
                      An organization administrator can schedule account closure from the same Data
                      Export page. Closure takes effect 30 days after the request. During those 30
                      days everything keeps working: your team can still export data, and any
                      administrator can cancel the closure with one click. Every member of the
                      organization sees a clear notice with the deletion date for the whole period.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-white">4. What deletion covers</h2>
                    <p>
                      When the grace period ends, we permanently delete all database records belonging
                      to the organization, all files it stored on the platform, its export archives,
                      and the accounts of members who do not belong to any other organization on
                      Petrolord. Items owned by people who remain members of another organization are
                      detached from the closed organization rather than deleted, because those items
                      belong to the individual. The deletion is verified programmatically: if any
                      record survives, the operation is rolled back and retried rather than reported
                      as complete.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-white">5. Certificate of Data Deletion</h2>
                    <p>
                      When deletion completes, the administrator who requested the closure receives a
                      Certificate of Data Deletion by email. It states what was destroyed and when,
                      and it carries a certificate number and a verification code. Anyone holding
                      both can confirm the certificate at{' '}
                      <Link to="/legal/verify-deletion" className="text-lime-400 hover:underline">
                        petrolord.com/legal/verify-deletion
                      </Link>
                      , which checks the facts directly against our deletion records.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-white">6. Backups</h2>
                    <p>
                      Copies of deleted data inside encrypted database backups cannot be individually
                      erased. They age out automatically as backups rotate on our infrastructure
                      provider. After the deletion date, no deleted data is readable through the
                      platform, and backups are used only for disaster recovery of the service as a
                      whole.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-white">7. Individual accounts</h2>
                    <p>
                      To close a personal account, or to request deletion of your personal data,
                      contact <a href="mailto:support@petrolord.com" className="text-lime-400 hover:underline">support@petrolord.com</a>.
                      We will action the request and confirm completion in writing.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-white">8. Questions</h2>
                    <p>
                      Our standard{' '}
                      <Link to="/legal/dpa" className="text-lime-400 hover:underline">Data Processing Agreement</Link>{' '}
                      is available for enterprise customers; contact{' '}
                      <a href="mailto:support@petrolord.com" className="text-lime-400 hover:underline">support@petrolord.com</a>{' '}
                      to execute a signed copy, or for anything not covered here.
                    </p>
                  </section>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default DataRetention;
