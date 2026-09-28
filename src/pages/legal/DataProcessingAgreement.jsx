import React from 'react';
import { Helmet } from 'react-helmet';
import { PublicPage } from '@/components/public/PublicPage';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

// Published DPA template (approved by legal 2026-08-05). The canonical source
// is docs/legal/DPA-TEMPLATE.md; keep the two in sync. Executed, customer-
// specific copies are arranged through support@petrolord.com.
const DataProcessingAgreement = () => {
  return (
    <>
      <Helmet>
        <title>Data Processing Agreement - Petrolord</title>
        <meta name="description" content="The standard Data Processing Agreement for enterprise customers of the Petrolord platform." />
      </Helmet>
      <div className="py-10 px-4 sm:px-6 sm:py-12 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Button asChild variant="outline">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Link>
            </Button>
          </div>
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="font-pl-display text-4xl font-semibold leading-tight text-pl-text">Data Processing Agreement</CardTitle>
              <p className="text-pl-muted mt-2">Standard template. Last Updated: August 5, 2026</p>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[60vh] pr-6">
                <div className="space-y-6 text-pl-text leading-relaxed">
                  <p className="text-pl-muted">
                    This is the standard Data Processing Agreement ("DPA") offered to enterprise
                    customers of the Petrolord platform. To execute a signed copy naming your
                    organization, contact{' '}
                    <a href="mailto:support@petrolord.com" className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">support@petrolord.com</a>.
                  </p>
                  <p>
                    This DPA forms part of the agreement between <strong>Lordsway Energy</strong>{' '}
                    ("Processor", operating the Petrolord platform) and the customer organization
                    named in the executed copy ("Controller") for the services described at
                    petrolord.com (the "Service").
                  </p>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">1. Subject matter and roles</h2>
                    <p>
                      The Controller determines the purposes of processing the data it uploads to or
                      creates on the Service ("Customer Data"). The Processor processes Customer Data
                      only to provide the Service, on the Controller&apos;s documented instructions as
                      expressed through the Service&apos;s features and configuration.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">2. Categories of data and data subjects</h2>
                    <ul className="list-disc list-inside space-y-2 pl-4">
                      <li>Account data of the Controller&apos;s personnel: names, work email addresses, roles, authentication records.</li>
                      <li>Technical and project data: geoscience, reservoir, drilling, production, economics and HSE data uploaded to or produced within the Service.</li>
                      <li>Billing records related to the Controller&apos;s subscription.</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">3. Confidentiality and isolation</h2>
                    <p>
                      Customer Data is logically isolated per organization through database-level row
                      security. Personnel of the Processor access Customer Data only for support or
                      operations, and access is limited to what the task requires.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">4. Security measures</h2>
                    <ul className="list-disc list-inside space-y-2 pl-4">
                      <li>Encryption in transit (TLS) and at rest.</li>
                      <li>Row-level security enforced in the database for every organization-scoped table; private storage buckets with per-user path policies and time-limited signed links.</li>
                      <li>Credentials and security tokens are excluded from all data exports.</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">5. Sub-processors</h2>
                    <p>
                      The Processor uses the following sub-processors: Supabase (database, storage
                      and authentication; hosted in the eu-west-2, London region), Hostinger (web
                      hosting), Resend and Brevo (transactional email), and Paystack and Stripe
                      (payment processing). The Processor will give the Controller at least 30 days
                      notice by email before adding or replacing a sub-processor that processes
                      Customer Data, and the Controller may object on reasonable data-protection
                      grounds within that period.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">6. Data portability</h2>
                    <p>
                      Administrators of the Controller&apos;s organization may export a complete copy of
                      Customer Data at any time from the Service (Dashboard, Data Export), covering
                      all database records and an inventory of stored files with secure download
                      links.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">7. Deletion and return</h2>
                    <p>
                      The Controller may schedule account closure from the Service. Closure takes
                      effect after a 30 day grace period during which the export remains available
                      and the closure can be cancelled. On completion the Processor permanently
                      deletes all Customer Data from live systems, verified programmatically, and
                      issues a Certificate of Data Deletion that can be independently verified at{' '}
                      <Link to="/legal/verify-deletion" className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">petrolord.com/legal/verify-deletion</Link>.
                      Copies within encrypted daily backups are retained for no more than seven days
                      and age out automatically as backups rotate.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">8. Personal data requests and breach notice</h2>
                    <p>
                      The Processor will assist the Controller with data-subject requests relating to
                      Customer Data, and will notify the Controller without undue delay, and in any
                      case within 72 hours of becoming aware, of a personal-data breach affecting
                      Customer Data.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">9. Applicable law</h2>
                    <p>
                      This DPA is governed by the laws of the Federal Republic of Nigeria, including
                      the Nigeria Data Protection Act 2023 and the Nigeria Data Protection
                      Regulation. Where the Controller is subject to the EU or UK GDPR, the relevant
                      standard contractual clauses are incorporated into the executed copy by
                      reference.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold text-pl-text">10. Term</h2>
                    <p>
                      This DPA applies for as long as the Processor processes Customer Data and
                      survives termination until deletion under section 7 completes.
                    </p>
                  </section>

                  <p className="text-pl-muted">
                    Related: our{' '}
                    <Link to="/legal/data-retention" className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">Data Retention and Offboarding policy</Link>{' '}
                    and{' '}
                    <Link to="/legal/privacy-policy" className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">Privacy Policy</Link>.
                  </p>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const DataProcessingAgreementPage = () => (
  <PublicPage testId="dpa-theme-scope">
    <DataProcessingAgreement />
  </PublicPage>
);

export default DataProcessingAgreementPage;
