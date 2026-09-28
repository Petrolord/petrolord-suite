import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayCircle, FileText, ChevronRight } from 'lucide-react';

// Design system 6E: the same themed pieces as the NPV help centre
// (components/npv/help/HelpComponents.jsx). The tutorial tiles drop their
// decorative thumbnail colour for a neutral sunken tile.

export const CategoryCard = ({ category, onClick }) => {
  const Icon = category.icon;
  return (
    <Card 
      className="hover:border-pl-border-strong hover:bg-pl-sunken cursor-pointer transition-all group"
      onClick={onClick}
    >
      <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
        <div className="p-3 rounded-full bg-pl-sunken transition-colors">
          <Icon className="w-8 h-8 text-pl-primary-text" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-bold text-pl-text mb-1">{category.title}</h3>
          <p className="text-sm text-pl-muted line-clamp-2">{category.description}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export const ArticleViewer = ({ article, onBack }) => {
  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center gap-2 text-sm text-pl-muted mb-2 cursor-pointer hover:text-pl-text" onClick={onBack}>
        <span>&larr; Back to Categories</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-4">
        <h1 className="text-3xl font-bold text-pl-text mb-6">{article.title}</h1>
        <div 
          className="prose max-w-none text-pl-text prose-headings:text-pl-text prose-p:text-pl-text prose-li:text-pl-text prose-strong:text-pl-text"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />
      </div>
    </div>
  );
};

export const FAQSection = ({ faqs }) => (
  <ScrollArea className="h-full pr-4">
    <div className="space-y-4">
      {faqs.map((item, index) => (
        <div key={index} className="p-4 rounded-lg bg-pl-surface border border-pl-border">
          <h4 className="font-bold text-pl-text mb-2 flex items-start gap-2">
            <span className="text-pl-primary-text">Q:</span> {item.q}
          </h4>
          <p className="text-pl-muted text-sm pl-6">{item.a}</p>
        </div>
      ))}
    </div>
  </ScrollArea>
);

export const GlossarySection = ({ terms }) => (
  <ScrollArea className="h-full pr-4">
    <div className="grid grid-cols-1 gap-4">
      {terms.map((item, index) => (
        <div key={index} className="p-4 rounded-lg bg-pl-surface border border-pl-border flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
          <span className="font-pl-mono font-semibold text-pl-text min-w-[120px]">{item.term}</span>
          <span className="text-pl-muted text-sm">{item.def}</span>
        </div>
      ))}
    </div>
  </ScrollArea>
);

export const TutorialCard = ({ tutorial }) => (
  <div className="bg-pl-surface border border-pl-border rounded-lg overflow-hidden group cursor-pointer hover:border-pl-border-strong transition-all">
    <div className="h-32 bg-pl-sunken relative flex items-center justify-center">
      <PlayCircle className="w-12 h-12 text-pl-muted opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" aria-hidden="true" />
      <Badge variant="neutral" className="absolute bottom-2 right-2">{tutorial.duration}</Badge>
    </div>
    <div className="p-3">
      <h4 className="font-semibold text-pl-text text-sm group-hover:text-pl-primary-text transition-colors">{tutorial.title}</h4>
    </div>
  </div>
);