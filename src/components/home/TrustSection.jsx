import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DatabaseBackup, Lock, BadgeCheck, ArrowRight } from 'lucide-react';

// Data-ownership trust section. Every claim here is a shipped, verifiable
// product feature (see docs/scope/OrgDataExport-STATUS.md); if the product
// changes, change this copy in the same PR.
const pillars = [
  {
    icon: DatabaseBackup,
    title: 'Export any time',
    description:
      'Organization admins can download a complete copy of every record and stored file in minutes, any day, for any reason. It doubles as an off-platform backup.',
  },
  {
    icon: Lock,
    title: 'Isolated by design',
    description:
      'Every organization’s data is isolated at the database level with row security. No other customer can ever read it, and exports never include credentials or tokens.',
  },
  {
    icon: BadgeCheck,
    title: 'Deletion you can prove',
    description:
      'Leaving is a feature. Account closure has a 30 day grace period, a programmatically verified purge, and a Certificate of Data Deletion that anyone can check on our public verifier.',
  },
];

const links = [
  { label: 'Data Retention & Offboarding policy', to: '/legal/data-retention' },
  { label: 'Data Processing Agreement', to: '/legal/dpa' },
  { label: 'Verify a deletion certificate', to: '/legal/verify-deletion' },
];

const TrustSection = () => {
  return (
    <section className="py-20 px-6 bg-slate-950/40">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-14"
        >
          <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-lime-300 uppercase bg-lime-500/10 rounded-full border border-lime-500/20">
            Data Ownership
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Your data. Always yours.
          </h2>
          <p className="text-xl text-slate-300 font-light">
            Everything your team creates on Petrolord stays your property, and you can prove it.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pillars.map((pillar, index) => (
            <motion.div
              key={pillar.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="rounded-xl bg-slate-900/60 border border-slate-800 p-6"
            >
              <div className="inline-flex p-3 rounded-lg bg-gradient-to-br from-lime-400 to-green-500 text-slate-900 shadow-lg mb-4">
                <pillar.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{pillar.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{pillar.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-3 text-sm"
        >
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex items-center gap-1 text-lime-300 hover:text-lime-200 transition-colors"
            >
              {link.label}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default TrustSection;
