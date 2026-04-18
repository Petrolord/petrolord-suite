
import React from 'react';
import { motion } from 'framer-motion';
import CompetitorMap from './CompetitorMap';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Newspaper, Map, Activity, BrainCircuit } from 'lucide-react';

const Dashboard = ({ results }) => {
  const { kpis, mapData, performanceChart, keywordCloud, newsFeed, narrativeSummary } = results;

  const WordCloud = ({ words }) => (
    <div className="flex flex-wrap justify-center items-center gap-4 p-4">
      {words.map((word, i) => (
        <span
          key={i}
          className="text-white"
          style={{
            fontSize: `${1 + word.weight * 0.2}rem`,
            opacity: 0.6 + word.weight * 0.04,
            fontWeight: 500 + word.weight * 20,
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Competitor Insights Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.map((kpi, index) => (
          <motion.div key={index} className="bg-white/5 p-4 rounded-lg">
            <p className="text-sm text-lime-300">{kpi.title}</p>
            <p className="text-2xl font-bold text-white">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="bg-white/5 p-4 rounded-lg">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center"><BrainCircuit className="w-5 h-5 mr-2 text-lime-300"/>AI Narrative Summary</h2>
        <p className="text-slate-300">{narrativeSummary}</p>
      </div>

      <Tabs defaultValue="map" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-slate-800">
          <TabsTrigger value="map"><Map className="w-4 h-4 mr-2"/>Activity Map</TabsTrigger>
          <TabsTrigger value="performance"><BarChart className="w-4 h-4 mr-2"/>Performance</TabsTrigger>
          <TabsTrigger value="keywords"><Activity className="w-4 h-4 mr-2"/>Keywords</TabsTrigger>
          <TabsTrigger value="news"><Newspaper className="w-4 h-4 mr-2"/>News Feed</TabsTrigger>
        </TabsList>
        <TabsContent value="map" className="bg-white/5 rounded-lg p-4 mt-2">
          <CompetitorMap markers={mapData} />
        </TabsContent>
        <TabsContent value="performance" className="bg-white/5 rounded-lg p-4 mt-2">
          <div className="w-full h-[400px] flex items-center justify-center bg-slate-800/50 text-slate-400 rounded-md">
            Chart removed
          </div>
        </TabsContent>
        <TabsContent value="keywords" className="bg-white/5 rounded-lg p-4 mt-2 h-[400px] flex items-center justify-center">
           <WordCloud words={keywordCloud} />
        </TabsContent>
        <TabsContent value="news" className="bg-white/5 rounded-lg p-4 mt-2 h-[400px] overflow-y-auto">
          <div className="space-y-4">
            {newsFeed.map((item, index) => (
              <div key={index} className="border-b border-white/10 pb-2">
                <h4 className="font-semibold text-lime-300">{item.title}</h4>
                <p className="text-sm text-slate-300">{item.snippet}</p>
                <a href={item.source} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-400 hover:underline">Source</a>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
