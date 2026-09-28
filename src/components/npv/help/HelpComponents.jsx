import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayCircle, FileText, ChevronRight } from 'lucide-react';

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

// The article HTML is styled with explicit role classes (the Suite has no
// typography plugin, so the old prose classes did nothing).
const ARTICLE_BODY = [
  'max-w-none text-sm leading-relaxed text-pl-text',
  '[&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold',
  '[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold',
  '[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold',
  '[&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:font-semibold',
  '[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1',
  '[&_strong]:font-semibold [&_a]:text-pl-primary-text [&_a]:underline [&_code]:rounded [&_code]:bg-pl-sunken [&_code]:px-1 [&_code]:font-pl-mono',
  '[&_table]:w-full [&_th]:border-b [&_th]:border-pl-border [&_th]:py-1 [&_th]:text-left [&_th]:text-pl-muted [&_td]:border-b [&_td]:border-pl-border [&_td]:py-1',
].join(' ');

export const ArticleViewer = ({ article, onBack }) => {
  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center gap-2 text-sm text-pl-muted mb-2 cursor-pointer hover:text-pl-text" onClick={onBack}>
        <span>&larr; Back to Categories</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-4">
        <h1 className="text-3xl font-bold text-pl-text mb-6">{article.title}</h1>
        <div 
          className={ARTICLE_BODY}
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
      <Badge variant="neutral" className="absolute top-2 left-2">{tutorial.level}</Badge>
    </div>
    <div className="p-3">
      <h4 className="font-semibold text-pl-text text-sm group-hover:text-pl-primary-text transition-colors">{tutorial.title}</h4>
    </div>
  </div>
);