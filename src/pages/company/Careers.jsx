import React, { useState } from 'react';
    import { Helmet } from 'react-helmet';
    import { PublicPage } from '@/components/public/PublicPage';
    import { Link } from 'react-router-dom';
    import { motion } from 'framer-motion';
    import { Button } from '@/components/ui/button';
    import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
    import { ArrowLeft, Briefcase, MapPin, BrainCircuit } from 'lucide-react';
    import ApplicationForm from '@/components/company/ApplicationForm';

    const jobOpenings = [
      {
        title: 'Senior Reservoir Engineer',
        location: 'Houston, TX (Remote)',
        department: 'Reservoir Management',
        description: 'Lead complex reservoir simulation and modeling projects. Drive innovation in our next-gen reservoir engineering tools.',
      },
      {
        title: 'Lead Frontend Developer (React)',
        location: 'Global (Remote)',
        department: 'Software Engineering',
        description: 'Architect and build beautiful, high-performance user interfaces for our suite of energy applications using React, Vite, and TailwindCSS.',
      },
      {
        title: 'Petroleum Data Scientist',
        location: 'Calgary, AB (Hybrid)',
        department: 'Geoscience & AI',
        description: 'Apply machine learning and AI techniques to solve complex subsurface challenges. Develop predictive models for drilling and production optimization.',
      },
      {
        title: 'Cloud Infrastructure Engineer',
        location: 'London, UK (Remote)',
        department: 'Platform & Infrastructure',
        description: 'Design, build, and maintain the scalable cloud infrastructure that powers the entire Petrolord ecosystem on Supabase and related cloud tech.',
      },
    ];

    const Careers = () => {
      const [isFormOpen, setIsFormOpen] = useState(false);
      const [selectedJob, setSelectedJob] = useState('');

      const handleApplyClick = (jobTitle) => {
        setSelectedJob(jobTitle);
        setIsFormOpen(true);
      };

      const handleCloseForm = () => {
        setIsFormOpen(false);
        setSelectedJob('');
      };
      
      return (
        <>
          <Helmet>
            <title>Careers - Petrolord</title>
            <meta name="description" content="Join the team at Lordsway Energy and help build the future of the energy industry with the Petrolord platform." />
          </Helmet>
          <div>
            <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-12">
              <div className="absolute top-4 left-4">
                <Button asChild variant="outline">
                  <Link to="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Home
                  </Link>
                </Button>
              </div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="text-center my-12"
              >
                <h1 className="font-pl-display text-5xl md:text-7xl font-semibold text-pl-text mb-4">
                  Shape the Future of Energy
                </h1>
                <p className="text-xl md:text-2xl text-pl-muted max-w-3xl mx-auto">
                  Join Lordsway Energy and be part of a team that's revolutionizing an industry. We're looking for passionate innovators and problem-solvers.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="my-16"
              >
                <h2 className="font-pl-display text-4xl font-semibold text-center text-pl-text mb-12 flex items-center justify-center">
                  <Briefcase className="mr-3 h-10 w-10 text-pl-primary-text" aria-hidden="true" />
                  Current Openings
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {jobOpenings.map((job, index) => (
                    <Card key={index} className="flex flex-col transform hover:scale-105 hover:border-pl-primary transition-all duration-300">
                      <CardHeader>
                        <CardTitle className="text-2xl text-pl-text">{job.title}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2">
                          <span className="flex items-center"><BrainCircuit className="mr-2 h-4 w-4 text-pl-muted" aria-hidden="true"/>{job.department}</span>
                          <span className="flex items-center"><MapPin className="mr-2 h-4 w-4 text-pl-muted" aria-hidden="true"/>{job.location}</span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex-grow">
                        <p className="text-pl-text">{job.description}</p>
                      </CardContent>
                      <CardFooter>
                        <Button onClick={() => handleApplyClick(job.title)} className="w-full font-semibold">
                          Apply Now
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.4 }}
                className="text-center my-20"
              >
                <h3 className="text-2xl font-semibold text-pl-text">Don't see your perfect role?</h3>
                <p className="text-pl-muted mt-2 mb-4">We're always looking for exceptional talent. Send us your resume!</p>
                <Button onClick={() => handleApplyClick('General Application')} size="lg" variant="outline">
                  Submit a General Application
                </Button>
              </motion.div>

            </div>
          </div>
          <ApplicationForm isOpen={isFormOpen} onClose={handleCloseForm} jobTitle={selectedJob} />
        </>
      );
    };

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const CareersPage = () => (
  <PublicPage testId="careers-theme-scope">
    <Careers />
  </PublicPage>
);

export default CareersPage;
