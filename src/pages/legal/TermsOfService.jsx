import React from 'react';
    import { Helmet } from 'react-helmet';
    import { PublicPage } from '@/components/public/PublicPage';
    import { Link } from 'react-router-dom';
    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
    import { ScrollArea } from '@/components/ui/scroll-area';
    import { Button } from '@/components/ui/button';
    import { ArrowLeft } from 'lucide-react';

    const TermsOfService = () => {
      return (
        <>
          <Helmet>
            <title>Terms of Service - Petrolord</title>
            <meta name="description" content="Read the Terms of Service for using the Petrolord platform and its applications." />
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
                  <CardTitle className="font-pl-display text-4xl font-semibold leading-tight text-pl-text">Terms of Service</CardTitle>
                  <p className="text-pl-muted mt-2">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] pr-6">
                    <div className="space-y-6 text-pl-text leading-relaxed">
                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">1. Agreement to Terms</h2>
                        <p>
                          By accessing or using Petrolord ("the Service"), a platform developed by Lordsway Energy ("we," "us," or "our"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of the terms, then you may not access the Service.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">2. User Accounts</h2>
                        <p>
                          When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service. You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">3. Intellectual Property</h2>
                        <p>
                          The Service and its original content (excluding content provided by users), features, and functionality are and will remain the exclusive property of Lordsway Energy and its licensors. The Service is protected by copyright, trademark, and other laws of both the applicable jurisdictions and foreign countries. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of Lordsway Energy.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">4. User Responsibilities and Conduct</h2>
                        <p>
                          You agree not to use the Service to:
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-4">
                          <li>Upload, post, or otherwise transmit any content that is unlawful, harmful, threatening, abusive, or otherwise objectionable.</li>
                          <li>Impersonate any person or entity, or falsely state or otherwise misrepresent your affiliation with a person or entity.</li>
                          <li>Upload or transmit viruses or any other type of malicious code that will or may be used in any way that will affect the functionality or operation of the Service.</li>
                          <li>Attempt to gain unauthorized access to, interfere with, damage, or disrupt any parts of the Service, the server on which the Service is stored, or any server, computer, or database connected to the Service.</li>
                        </ul>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">5. Data and Content</h2>
                        <p>
                          You retain all your rights to any data you submit, post or display on or through the Service. By submitting data, you grant us a worldwide, non-exclusive, royalty-free license to use, copy, reproduce, process, adapt, modify, publish, transmit, display and distribute such data in any and all media or distribution methods, solely for the purpose of operating, developing, providing, and improving the Service.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">6. Termination</h2>
                        <p>
                          We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">7. Disclaimer of Warranties</h2>
                        <p>
                          The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement, or course of performance. Lordsway Energy does not warrant that the results of the use of the service will be accurate or reliable.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">8. Limitation of Liability</h2>
                        <p>
                          In no event shall Lordsway Energy, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">9. Governing Law</h2>
                        <p>
                          These Terms shall be governed and construed in accordance with the laws of the jurisdiction in which Lordsway Energy is established, without regard to its conflict of law provisions.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">10. Changes to Terms</h2>
                        <p>
                          We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will provide at least 30 days' notice prior to any new terms taking effect. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.
                        </p>
                      </section>

                      <section>
                        <h2 className="text-xl font-semibold text-pl-text">11. Contact Us</h2>
                        <p>
                          If you have any questions about these Terms, please contact us at <a href="mailto:legal@petrolord.com" className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">legal@petrolord.com</a>.
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
const TermsOfServicePage = () => (
  <PublicPage testId="terms-theme-scope">
    <TermsOfService />
  </PublicPage>
);

export default TermsOfServicePage;
