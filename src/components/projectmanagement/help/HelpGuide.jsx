import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, HelpCircle, Book, Video, MessageSquare, FileText, Mail, ChevronRight } from 'lucide-react';
import { HELP_CATEGORIES, HELP_ARTICLES, FAQS, GLOSSARY, TUTORIALS } from '@/data/pmHelpContent';
import { CategoryCard, ArticleViewer, FAQSection, GlossarySection, TutorialCard } from './HelpComponents';

const HelpGuide = ({ open, onOpenChange }) => {
  const [searchQuery, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeArticle, setActiveArticle] = useState(null);
  const [activeTab, setActiveTab] = useState('articles');

  // Search Logic
  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return HELP_ARTICLES.filter(article => 
      article.title.toLowerCase().includes(lowerQuery) || 
      article.content.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery]);

  const handleCategoryClick = (catId) => {
    setActiveCategory(catId);
    setActiveArticle(null);
  };

  const handleArticleClick = (article) => {
    setActiveArticle(article);
  };

  const handleBackToCategories = () => {
    setActiveCategory(null);
    setActiveArticle(null);
  };

  const handleBackToArticles = () => {
    setActiveArticle(null);
  };

  // Filter articles by active category
  const categoryArticles = useMemo(() => {
    if (!activeCategory) return [];
    return HELP_ARTICLES.filter(a => a.categoryId === activeCategory);
  }, [activeCategory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Interim (rollout 6C): a dark island until this file moves to theme roles; remove data-pl-theme then. */}
      <DialogContent data-pl-theme="dark" className="bg-slate-950 border-slate-800 text-white max-w-5xl h-[80vh] flex flex-col p-0 overflow-hidden">
        
        {/* Header & Search */}
        <div className="p-6 border-b border-slate-800 bg-slate-900">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <HelpCircle className="w-6 h-6 text-blue-400" />
              Help Center
            </DialogTitle>
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Search articles, tutorials, and more..." 
                className="pl-9 bg-slate-800 border-slate-700 focus:border-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Sidebar Navigation */}
          <div className="w-64 bg-slate-900 border-r border-slate-800 hidden md:flex flex-col p-4 space-y-2">
            <Button 
              variant={activeTab === 'articles' ? "secondary" : "ghost"} 
              className="justify-start w-full" 
              onClick={() => { setActiveTab('articles'); handleBackToCategories(); }}
            >
              <Book className="w-4 h-4 mr-2" /> Guide & Articles
            </Button>
            <Button 
              variant={activeTab === 'tutorials' ? "secondary" : "ghost"} 
              className="justify-start w-full" 
              onClick={() => setActiveTab('tutorials')}
            >
              <Video className="w-4 h-4 mr-2" /> Video Tutorials
            </Button>
            <Button 
              variant={activeTab === 'faq' ? "secondary" : "ghost"} 
              className="justify-start w-full" 
              onClick={() => setActiveTab('faq')}
            >
              <MessageSquare className="w-4 h-4 mr-2" /> FAQ
            </Button>
            <Button 
              variant={activeTab === 'glossary' ? "secondary" : "ghost"} 
              className="justify-start w-full" 
              onClick={() => setActiveTab('glossary')}
            >
              <FileText className="w-4 h-4 mr-2" /> Glossary
            </Button>
            
            <div className="mt-auto pt-4 border-t border-slate-800">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <Mail className="w-4 h-4 mr-2" /> Contact Support
              </Button>
            </div>
          </div>

          {/* Content Pane */}
          <div className="flex-1 p-6 overflow-y-auto bg-slate-950">
            
            {/* Search Results Overlay */}
            {searchQuery ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200">Search Results for "{searchQuery}"</h3>
                {searchResults.length > 0 ? (
                  <div className="grid gap-2">
                    {searchResults.map(article => (
                      <div 
                        key={article.id} 
                        className="p-4 bg-slate-900 border border-slate-800 rounded-lg hover:border-blue-500 cursor-pointer"
                        onClick={() => { setActiveArticle(article); setSearchTerm(''); setActiveTab('articles'); }}
                      >
                        <h4 className="font-bold text-blue-400">{article.title}</h4>
                        <p className="text-xs text-slate-500 mt-1">In {HELP_CATEGORIES.find(c => c.id === article.categoryId)?.title}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500">No results found.</p>
                )}
              </div>
            ) : (
              <>
                {/* Articles Tab */}
                {activeTab === 'articles' && (
                  <>
                    {!activeCategory && !activeArticle && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {HELP_CATEGORIES.map(cat => (
                          <CategoryCard key={cat.id} category={cat} onClick={() => handleCategoryClick(cat.id)} />
                        ))}
                      </div>
                    )}

                    {activeCategory && !activeArticle && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm text-slate-400 mb-4 cursor-pointer hover:text-white" onClick={handleBackToCategories}>
                          <span>&larr; Back to Categories</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-4">{HELP_CATEGORIES.find(c => c.id === activeCategory)?.title}</h2>
                        <div className="grid gap-3">
                          {categoryArticles.map(article => (
                            <div 
                              key={article.id}
                              className="p-4 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 cursor-pointer flex justify-between items-center group"
                              onClick={() => handleArticleClick(article)}
                            >
                              <span className="text-slate-200 font-medium group-hover:text-blue-400 transition-colors">{article.title}</span>
                              <ChevronRight className="w-4 h-4 text-slate-600" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeArticle && (
                      <ArticleViewer article={activeArticle} onBack={activeCategory ? handleBackToArticles : handleBackToCategories} />
                    )}
                  </>
                )}

                {/* Other Tabs */}
                {activeTab === 'tutorials' && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-bold text-white">Video Tutorials</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {TUTORIALS.map(t => <TutorialCard key={t.id} tutorial={t} />)}
                    </div>
                  </div>
                )}

                {activeTab === 'faq' && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-bold text-white">Frequently Asked Questions</h2>
                    <FAQSection faqs={FAQS} />
                  </div>
                )}

                {activeTab === 'glossary' && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-bold text-white">Glossary</h2>
                    <GlossarySection terms={GLOSSARY} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HelpGuide;