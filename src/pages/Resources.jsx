import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { ArrowRight, BookOpen, GraduationCap, LifeBuoy, MessageSquare } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const Resources = () => {
  const resources = [
    {
      title: 'NextGen Academy',
      icon: GraduationCap,
      description: 'Courses across the modules of the platform, each at three certificate tiers and graded on the same engines the applications run.',
      to: '/nextgen',
      cta: 'Visit the Academy',
    },
    {
      title: 'Help guides in every studio',
      icon: LifeBuoy,
      description: 'Each application carries its own help guide, reached from its ribbon, covering the method, the inputs and how to read the results.',
      to: '/dashboard',
      cta: 'Open your dashboard',
    },
    {
      title: 'Documentation',
      icon: BookOpen,
      description: 'An overview of the applications, grouped by module.',
      to: '/legal/documentation',
      cta: 'Read the documentation',
    },
    {
      title: 'Contact & Support',
      icon: MessageSquare,
      description: 'Questions about a workflow, a result or your subscription go to our support team.',
      to: '/legal/support',
      cta: 'Get support',
    },
  ];

  return (
    <>
      <Helmet>
        <title>Resources - Petrolord</title>
        <meta name="description" content="Learning and support resources for the Petrolord platform: the NextGen Academy, in-app help guides, documentation and support." />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-green-950 text-slate-200">
        <Header />
        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center my-12"
          >
            <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-white via-lime-200 to-green-300 bg-clip-text text-transparent mb-4">
              Resources
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 max-w-4xl mx-auto">
              Where to learn the platform and where to get help with it.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {resources.map((item) => (
              <Card key={item.title} className="bg-slate-800/60 border-slate-700 flex flex-col justify-between hover:border-lime-400 transition-colors duration-300 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl text-slate-100">
                    <item.icon className="mr-3 h-6 w-6 text-lime-400" />
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-slate-400">{item.description}</p>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="link" className="p-0 text-lime-400 hover:text-lime-300">
                    <Link to={item.to}>
                      {item.cta} <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
};

export default Resources;