import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { BookOpen, FileText, Video, Rss, ArrowRight, Download } from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const Resources = () => {
  const { toast } = useToast();

  const resources = [
    {
      type: 'Case Studies',
      icon: BookOpen,
      color: 'text-cyan-400',
      items: [
        {
          title: 'Digital Twin Implementation Boosts Production by 15%',
          description: 'How a major operator leveraged Petrolord\'s Integrated Asset Modeler to optimize their brownfield asset.',
        },
        {
          title: 'AI-Powered Geosteering Reduces Drilling Time by 30%',
          description: 'Discover how real-time AI guidance in Well Design Studio transformed drilling operations.',
        },
        {
          title: 'Portfolio Optimization Unlocks $200M in Capital Efficiency',
          description: 'A deep dive into using the Capital Portfolio Studio to maximize value across a diverse asset base.',
        },
      ],
    },
    {
      type: 'White Papers',
      icon: FileText,
      color: 'text-lime-400',
      items: [
        {
          title: 'The Future of Energy: An Integrated Cloud Ecosystem',
          description: 'An in-depth look at the paradigm shift from siloed software to a unified digital operating system.',
        },
        {
          title: 'Generative AI in Subsurface Characterization',
          description: 'Exploring the impact of AI on seismic interpretation, reservoir modeling, and risk reduction.',
        },
        {
          title: 'Automating Field Development Planning (FDP)',
          description: 'Methodologies for accelerating FDP timelines from months to weeks using the FDP Accelerator.',
        },
      ],
    },
    {
      type: 'Webinars',
      icon: Video,
      color: 'text-purple-400',
      items: [
        {
          title: 'On-Demand: Introduction to Subsurface Studio',
          description: 'A comprehensive walkthrough of our flagship geoscience platform. Learn to integrate seismic, well, and reservoir data seamlessly.',
        },
        {
          title: 'On-Demand: Real-Time Drilling Optimization with RTO Dashboard',
          description: 'Join our experts to see how to prevent incidents and improve drilling performance with live data analytics.',
        },
        {
          title: 'On-Demand: Economic Planning Engine Masterclass',
          description: 'Learn how to run complex economic scenarios and fiscal regimes in minutes with the EPE.',
        },
      ],
    },
     {
      type: 'Blog',
      icon: Rss,
      color: 'text-orange-400',
      items: [
        {
          title: 'Why Your Legacy Software Is Costing You More Than You Think',
          description: 'The hidden costs of maintaining outdated, disconnected systems in the modern energy landscape.',
        },
        {
          title: 'Top 5 Features in the Latest Petrolord Platform Update',
          description: 'A rundown of the newest tools and enhancements designed to supercharge your workflows.',
        },
        {
          title: 'Meet the Team: An Interview with our Lead AI Scientist',
          description: 'A conversation about the future of artificial intelligence in the oil and gas industry.',
        },
      ],
    },
    {
      type: 'Brochures',
      icon: Download,
      color: 'text-blue-400',
      items: [
        {
          title: 'Petrolord Platform Overview',
          description: 'A comprehensive look at all the powerful features and modules available in the Petrolord platform.',
        },
        {
          title: 'Digital Transformation in Energy',
          description: 'Our vision for how digital solutions are revolutionizing the energy sector.',
        },
        {
          title: 'AI & Machine Learning Capabilities',
          description: 'Dive deep into the AI and ML technologies powering Petrolord\'s intelligent applications.',
        },
      ],
    },
  ];

  const handleBrochureClick = () => {
    toast({
      title: 'Check back later',
      description: 'This brochure is not yet available for download.',
    });
  };

  const handleReadMoreClick = () => {
    toast({
        title: "Read More Coming Soon!",
        description: "We're preparing more great content for you."
    });
  };

  return (
    <>
      <Helmet>
        <title>Resources - Petrolord</title>
        <meta name="description" content="Explore case studies, white papers, webinars, and blog posts from the experts at Petrolord. Gain insights into the future of the energy industry." />
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
              Knowledge Hub
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 max-w-4xl mx-auto">
              Your central repository for industry insights, technical deep-dives, and success stories powered by the Petrolord platform.
            </p>
          </motion.div>

          <div className="space-y-20">
            {resources.map((category) => (
              <motion.section
                key={category.type}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.2 }}
              >
                <h2 className={`flex items-center text-3xl font-bold mb-8 ${category.color}`}>
                  <category.icon className="mr-4 h-8 w-8" />
                  {category.type}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {category.items.map((item, index) => (
                    <Card key={index} className="bg-slate-800/60 border-slate-700 flex flex-col justify-between transform hover:scale-105 hover:border-lime-400 transition-all duration-300 shadow-lg">
                      <CardHeader>
                        <CardTitle className="text-xl text-slate-100">{item.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-grow">
                        <p className="text-slate-400">{item.description}</p>
                      </CardContent>
                      <CardFooter>
                        {category.type === 'Brochures' ? (
                          <Button variant="link" onClick={handleBrochureClick} className="p-0 text-blue-400 hover:text-blue-300">
                            Download <Download className="ml-2 h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="link" onClick={handleReadMoreClick} className="p-0 text-lime-400 hover:text-lime-300">
                            Read More <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </motion.section>
            ))}
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
};

export default Resources;