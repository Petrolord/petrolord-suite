import React from 'react';
    import { Helmet } from 'react-helmet';
    import { PublicPage } from '@/components/public/PublicPage';
    import { Link } from 'react-router-dom';
    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
    import { ScrollArea } from '@/components/ui/scroll-area';
    import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
    import { Button } from '@/components/ui/button';
    import { Mail, Phone, BookOpen, ArrowLeft } from 'lucide-react';

    const Support = () => {
      const faqs = [
        {
          question: 'How do I get started with an application?',
          answer: 'Navigate to the desired application from your dashboard. Most applications will have a "Help Guide" or "User Guide" in the header section to get you started. For a more hands-on approach, look for sample data loading options.',
        },
        {
          question: 'Where can I find my saved projects?',
          answer: 'You can access all your saved projects across different applications by navigating to the "My Projects" page from the main dashboard sidebar.',
        },
        {
          question: 'How is my data secured?',
          answer: 'We take data security very seriously. All your project data is stored securely and is only accessible by you. For more details, please refer to our Privacy Policy.',
        },
        {
          question: 'What if I encounter an error or a bug?',
          answer: 'Please contact our support team immediately via email at support@petrolord.com with a description of the issue, the application you were using, and any relevant screenshots. This will help us resolve the issue as quickly as possible.',
        },
      ];

      return (
        <>
          <Helmet>
            <title>Support - Petrolord</title>
            <meta name="description" content="Get help and support for the Petrolord platform. Find FAQs, contact information, and documentation." />
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
                  <CardTitle className="font-pl-display text-4xl font-semibold leading-tight text-pl-text">Support Center</CardTitle>
                  <p className="text-pl-muted mt-2">We're here to help you get the most out of Petrolord.</p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] pr-6">
                    <div className="space-y-8">
                      <section>
                        <h2 className="text-2xl font-semibold text-pl-text mb-4">Contact Us</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <a href="mailto:support@petrolord.com" className="group">
                            <Card className="bg-pl-raised hover:border-pl-primary transition-colors">
                              <CardContent className="pt-6 flex items-center space-x-4">
                                <Mail className="h-8 w-8 text-pl-primary-text" />
                                <div>
                                  <p className="font-semibold text-pl-text">Email Support</p>
                                  <p className="text-pl-muted group-hover:text-pl-primary-text">support@petrolord.com</p>
                                </div>
                              </CardContent>
                            </Card>
                          </a>
                           <div className="group">
                            <Card className="bg-pl-raised">
                              <CardContent className="pt-6 flex items-center space-x-4">
                                <Phone className="h-8 w-8 text-pl-primary-text" />
                                <div>
                                  <p className="font-semibold text-pl-text">Phone Support</p>
                                  <p className="text-pl-muted">+1 (555) 123-4567</p>
                                </div>
                              </CardContent>
                            </Card>
                           </div>
                        </div>
                      </section>

                      <section>
                        <h2 className="text-2xl font-semibold text-pl-text mb-4">Frequently Asked Questions</h2>
                        <Accordion type="single" collapsible className="w-full">
                          {faqs.map((faq, index) => (
                            <AccordionItem value={`item-${index}`} key={index} className="border-pl-border">
                              <AccordionTrigger className="text-left hover:no-underline text-pl-text">{faq.question}</AccordionTrigger>
                              <AccordionContent className="text-pl-muted">
                                {faq.answer}
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </section>

                      <section>
                        <h2 className="text-2xl font-semibold text-pl-text mb-4">Documentation</h2>
                        <Card className="bg-pl-raised">
                          <CardContent className="pt-6">
                            <div className="flex items-center space-x-4">
                                <BookOpen className="h-8 w-8 text-pl-primary-text"/>
                                <div>
                                    <p className="font-semibold text-pl-text">Platform Documentation</p>
                                    <p className="text-pl-muted">Explore in-depth guides and tutorials for all our applications.</p>
                                </div>
                            </div>
                            <Button asChild className="mt-4 w-full sm:w-auto" variant="outline">
                                <Link to="/legal/documentation">
                                    Go to Documentation
                                </Link>
                            </Button>
                          </CardContent>
                        </Card>
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
const SupportPage = () => (
  <PublicPage testId="support-theme-scope">
    <Support />
  </PublicPage>
);

export default SupportPage;
