import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, GraduationCap, Award, BookOpen, Percent } from 'lucide-react';

const NextGenInfoCard = () => {
  const navigate = useNavigate();

  return (
    <section className="py-12 px-6 bg-slate-900">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="relative bg-gradient-to-br from-[#1e1a2e] to-[#3a2a0f] border border-amber-500/30 rounded-2xl overflow-hidden shadow-[0_0_40px_-10px_rgba(245,158,11,0.25)] group hover:shadow-[0_0_60px_-10px_rgba(245,158,11,0.4)] transition-all duration-500"
        >
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-10 p-8 md:p-12">
            <div className="flex-1 space-y-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-600/20 rounded-xl border border-amber-500/30 text-amber-400 shadow-inner">
                  <GraduationCap className="w-8 h-8" />
                </div>
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-600 text-white border-none px-4 py-1.5 text-xs font-bold tracking-wide shadow-lg shadow-amber-900/50">
                  NEXTGEN ACADEMY
                </Badge>
              </div>

              <div className="space-y-3">
                <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                  Learn on the same tools you will work with
                </h2>
                <p className="text-lg text-slate-300 leading-relaxed max-w-2xl">
                  NextGen Academy delivers certification courses built directly on Petrolord Suite applications.
                  Progress through Explorer, Practitioner, and Expert tiers with hands-on projects and graded assessments.
                </p>
              </div>

              <div className="flex flex-wrap gap-6 pt-2">
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                  <BookOpen className="w-5 h-5 text-amber-400" />
                  <span className="text-sm font-semibold text-slate-200">App-Based Courses</span>
                </div>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                  <Award className="w-5 h-5 text-lime-400" />
                  <span className="text-sm font-semibold text-slate-200">Tiered Certification</span>
                </div>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                  <Percent className="w-5 h-5 text-cyan-400" />
                  <span className="text-sm font-semibold text-slate-200">Expert Certificates Earn Suite Discounts</span>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-lg px-8 py-6 h-auto shadow-lg shadow-amber-900/30 transition-all duration-300 border-t border-white/20"
                  onClick={() => navigate('/nextgen')}
                >
                  Discover NextGen
                  <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </div>

            <div className="w-full md:w-1/3 flex justify-center items-center">
              <div className="relative">
                <div className="absolute inset-0 bg-amber-400/20 blur-[50px] rounded-full animate-pulse-slow"></div>
                <GraduationCap className="w-48 h-48 md:w-60 md:h-60 text-slate-900/50 fill-amber-500/10 stroke-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]" strokeWidth={0.5} />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default NextGenInfoCard;
