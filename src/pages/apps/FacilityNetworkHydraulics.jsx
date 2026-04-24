import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Factory } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import LineSizing from '@/components/facilitynetworkhydraulics/LineSizing';
import MultiphaseHydraulics from '@/components/facilitynetworkhydraulics/MultiphaseHydraulics';
import WallThickness from '@/components/facilitynetworkhydraulics/WallThickness';
import PiggingAnalysis from '@/components/facilitynetworkhydraulics/PiggingAnalysis';
import DeliverablesGenerator from '@/components/facilitynetworkhydraulics/DeliverablesGenerator';

const FacilityNetworkHydraulics = () => {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Facility Network Hydraulics - Petrolord</title>
        <meta name="description" content="Design and analyze facility gathering networks with steady-state multiphase hydraulics." />
      </Helmet>
      <div className="p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-slate-900 to-indigo-950/50 min-h-screen text-white">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5 }}
          className="flex justify-between items-center mb-6"
        >
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-3 rounded-xl">
              <Factory className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white">Facility Network Hydraulics</h1>
              <p className="text-indigo-200 text-base sm:text-lg">Gathering lines, manifolds, headers & steady-state multiphase analysis.</p>
            </div>
          </div>
          <Button onClick={() => navigate('/dashboard/facilities')} className="bg-white/10 hover:bg-white/20 text-white">
            Back to Facilities
          </Button>
        </motion.div>
        
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
        >
           <Tabs defaultValue="line-sizing" className="w-full">
            <TabsList className="grid w-full grid-cols-5 bg-slate-800/60 border border-slate-700 h-auto rounded-lg overflow-hidden">
              <TabsTrigger value="line-sizing" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Pipeline Sizer</TabsTrigger>
              <TabsTrigger value="multiphase-hydraulics" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Multiphase Hydraulics</TabsTrigger>
              <TabsTrigger value="wall-thickness" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Wall Thickness</TabsTrigger>
              <TabsTrigger value="pigging" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Pigging</TabsTrigger>
              <TabsTrigger value="deliverables" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Deliverables</TabsTrigger>
            </TabsList>
            <div className="mt-6">
              <TabsContent value="line-sizing">
                  <LineSizing />
              </TabsContent>
              <TabsContent value="multiphase-hydraulics">
                <MultiphaseHydraulics />
              </TabsContent>
              <TabsContent value="wall-thickness">
                <WallThickness />
              </TabsContent>
              <TabsContent value="pigging">
                <PiggingAnalysis />
              </TabsContent>
              <TabsContent value="deliverables">
                <DeliverablesGenerator />
              </TabsContent>
            </div>
          </Tabs>
        </motion.div>
      </div>
    </>
  );
};

export default FacilityNetworkHydraulics;