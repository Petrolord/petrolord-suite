import React from 'react';
    import { Helmet } from 'react-helmet';
    import { PublicPage } from '@/components/public/PublicPage';
    import { Link } from 'react-router-dom';
    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
    import { ScrollArea } from '@/components/ui/scroll-area';
    import { Button } from '@/components/ui/button';
    import { ArrowLeft } from 'lucide-react';

    const PrivacyPolicy = () => {
      return (
        <>
          <Helmet>
            <title>Privacy Policy - Petrolord</title>
            <meta name="description" content="Read the Privacy Policy for the Petrolord platform to understand how we handle your data." />
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
                  <CardTitle className="font-pl-display text-4xl font-semibold leading-tight text-pl-text">Privacy Policy</CardTitle>
                  <p className="text-pl-muted mt-2">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] pr-6">
                    <div className="space-y-6 text-pl-text leading-relaxed">
                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">1. Introduction</h2>
                        <p>
                          Welcome to Petrolord, a platform by Lordsway Energy ("we," "us," or "our"). We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform and services ("Service"). Please read this policy carefully.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">2. Information We Collect</h2>
                        <p>
                          We may collect information about you in a variety of ways. The information we may collect on the Service includes:
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-4">
                          <li>
                            <strong>Personal Data:</strong> Personally identifiable information, such as your name, email address, and contact details, that you voluntarily give to us when you register for an account.
                          </li>
                          <li>
                            <strong>Derivative Data:</strong> Information our servers automatically collect when you access the Service, such as your IP address, browser type, operating system, and access times.
                          </li>
                          <li>
                            <strong>Project Data:</strong> Data, files, and inputs you upload or create within the applications on our Service. This data remains your intellectual property but is processed by our Service to provide you with the functionalities you request.
                          </li>
                        </ul>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">3. Use of Your Information</h2>
                        <p>
                          Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Service to:
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-4">
                          <li>Create and manage your account.</li>
                          <li>Email you regarding your account or order.</li>
                          <li>Enable user-to-user communications.</li>
                          <li>Improve the efficiency and operation of the Service.</li>
                          <li>Monitor and analyze usage and trends to improve your experience with the Service.</li>
                          <li>Notify you of updates to the Service.</li>
                        </ul>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">4. Disclosure of Your Information</h2>
                        <p>
                          We do not share, sell, rent, or trade your personal information with third parties for their commercial purposes. We may share information we have collected about you in certain situations:
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-4">
                          <li>
                            <strong>By Law or to Protect Rights:</strong> If we believe the release of information about you is necessary to respond to legal process, to investigate or remedy potential violations of our policies, or to protect the rights, property, and safety of others.
                          </li>
                          <li>
                            <strong>Third-Party Service Providers:</strong> We may share your information with third parties that perform services for us or on our behalf, including data analysis, hosting services, and customer service. These third parties are contractually obligated to keep your information confidential.
                          </li>
                        </ul>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">5. Security of Your Information</h2>
                        <p>
                          We use administrative, technical, and physical security measures to help protect your personal information and project data. While we have taken reasonable steps to secure the information you provide to us, please be aware that no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">6. Your Data Rights</h2>
                        <p>
                          You have the right to access, correct, or delete your personal data. You can review and change your account information at any time from your profile. Organization administrators can download a complete copy of their organization&apos;s data at any time from the Data Export page in the dashboard, and can schedule account closure from the same page, with a 30 day grace period and a verifiable Certificate of Data Deletion on completion. Full details are in our <Link to="/legal/data-retention" className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">Data Retention and Offboarding policy</Link>. To close a personal account or request deletion of your personal data, contact support@petrolord.com and we will action the request and confirm completion in writing.
                        </p>
                      </section>
                      
                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">7. Policy for Children</h2>
                        <p>
                          We do not knowingly solicit information from or market to children under the age of 13. If you become aware of any data we have collected from children under age 13, please contact us using the contact information provided below.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">8. Changes to This Privacy Policy</h2>
                        <p>
                          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">9. Contact Us</h2>
                        <p>
                          If you have any questions about this Privacy Policy, please contact us at <a href="mailto:privacy@petrolord.com" className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">privacy@petrolord.com</a>.
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

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const PrivacyPolicyPage = () => (
  <PublicPage testId="privacy-theme-scope">
    <PrivacyPolicy />
  </PublicPage>
);

export default PrivacyPolicyPage;
