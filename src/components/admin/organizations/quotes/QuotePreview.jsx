import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { Card } from '@/components/ui/card';

const QuotePreview = ({ quote, organization, onClose }) => {
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-end mb-4">
        <Button variant="ghost" onClick={onClose} className="text-white hover:bg-slate-800">
          <X className="h-6 w-6" />
        </Button>
      </div>
      <Card className="flex-1 bg-white text-slate-900 p-8 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <div className="border-b pb-4 mb-4 flex justify-between">
            <h1 className="text-2xl font-bold">PROPOSAL</h1>
            <div className="text-right">
              <div className="font-bold text-lg text-slate-700">{organization?.name}</div>
              <div className="text-sm text-slate-500">{new Date().toLocaleDateString()}</div>
            </div>
          </div>
          
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-2">{quote?.name}</h2>
            <p className="text-slate-600">Quote ID: {quote?.id}</p>
          </div>

          <div className="bg-slate-100 p-4 rounded mb-8">
            <div className="flex justify-between font-bold text-lg">
              <span>Total Investment</span>
              <span>${quote?.amount?.toLocaleString()} / mo</span>
            </div>
          </div>

          <div className="prose max-w-none">
            <h3>Terms</h3>
            <p>{quote?.terms || 'Standard terms apply.'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default QuotePreview;