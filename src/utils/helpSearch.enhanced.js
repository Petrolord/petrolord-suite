import { helpArticles } from '@/data/helpCenter/helpArticles';
import { helpFAQ } from '@/data/helpCenter/helpFAQ'; // Fixed import path
import { videosDetailed } from '@/data/helpCenter/videosDetailed';
import { resourcesDetailed } from '@/data/helpCenter/resourcesDetailed';

/**
 * Enhanced search utility for the Help Center
 */

export const searchHelpContent = (query, filters = {}) => {
  if (!query || query.length < 2) return { articles: [], faqs: [], videos: [], resources: [] };

  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(' ').filter(t => t.length > 2);

  // Helper to calculate relevance score
  const calculateScore = (item, type) => {
    let score = 0;
    const title = item.title || item.question || '';
    const content = item.content || item.answer || item.description || '';
    const tags = item.tags || [];
    const category = item.category || '';

    // Exact phrase match in title
    if (title.toLowerCase().includes(lowerQuery)) score += 50;
    // Exact phrase match in content
    if (content.toLowerCase().includes(lowerQuery)) score += 20;

    // Term matches
    terms.forEach(term => {
      if (title.toLowerCase().includes(term)) score += 10;
      if (content.toLowerCase().includes(term)) score += 2;
      if (tags.some(tag => tag.toLowerCase().includes(term))) score += 5;
      if (category.toLowerCase().includes(term)) score += 3;
    });

    return score;
  };

  // Filter and rank Articles
  const articles = helpArticles
    .map(item => ({ ...item, score: calculateScore(item, 'article'), type: 'article' }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // Filter and rank FAQs
  const faqs = helpFAQ
    .map(item => ({ ...item, score: calculateScore(item, 'faq'), type: 'faq' }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // Filter and rank Videos
  const videos = videosDetailed
    .map(item => ({ ...item, score: calculateScore(item, 'video'), type: 'video' }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // Filter and rank Resources
  const resources = resourcesDetailed
    .map(item => ({ ...item, score: calculateScore(item, 'resource'), type: 'resource' }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    articles,
    faqs,
    videos,
    resources,
    total: articles.length + faqs.length + videos.length + resources.length
  };
};

export const getSearchSuggestions = (query) => {
  if (!query || query.length < 2) return [];
  const results = searchHelpContent(query);
  
  // Combine all titles/questions
  const suggestions = [
    ...results.articles.map(a => ({ text: a.title, type: 'article', id: a.id })),
    ...results.faqs.map(f => ({ text: f.question, type: 'faq', id: f.id })),
    ...results.videos.map(v => ({ text: v.title, type: 'video', id: v.id }))
  ];

  return suggestions.slice(0, 8);
};