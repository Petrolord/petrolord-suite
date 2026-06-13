import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, BarChart3, Shield } from 'lucide-react';

const Landing = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Welcome to <span className="text-blue-400">Petrolord Suite</span>
          </h1>
          <p className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto">
            The comprehensive digital platform for petroleum engineering, geoscience analytics, and project management.
          </p>
          <Link to="/dashboard">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg">
              Get Started
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700">
            <div className="bg-blue-500/20 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Advanced Analytics</h3>
            <p className="text-slate-300">
              Powerful data analysis tools for reservoir characterization, production optimization, and economic evaluation.
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700">
            <div className="bg-green-500/20 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Integrated Workflows</h3>
            <p className="text-slate-300">
              Seamless integration across geoscience, engineering, and commercial disciplines in a unified platform.
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700">
            <div className="bg-purple-500/20 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Enterprise Security</h3>
            <p className="text-slate-300">
              Industry-grade security and compliance features designed for critical energy sector applications.
            </p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to transform your workflows?
          </h2>
          <p className="text-slate-300 mb-8 max-w-2xl mx-auto">
            Join thousands of professionals using Petrolord Suite to optimize their petroleum engineering and geoscience operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/dashboard">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                Access Dashboard
              </Button>
            </Link>
            <Link to="/get-quote">
              <Button size="lg" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-800">
                Get Quote
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;