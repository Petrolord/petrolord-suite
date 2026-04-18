import { supabase } from '@/lib/customSupabaseClient';
import { MOCK_REVIEWS, MOCK_COMMENTS, MOCK_AUDIT } from './mockData';

// In-memory state for fallback and instant UI updates during session
let localReviews = [...MOCK_REVIEWS];
let localComments = [...MOCK_COMMENTS];
let localAudit = [...MOCK_AUDIT];

export const PeerReviewService = {
  async getDashboardStats() {
    const active = localReviews.filter(r => ['Draft', 'In Review', 'Verification'].includes(r.stage)).length;
    const overdue = localReviews.filter(r => r.stage !== 'Closed' && new Date(r.due_date) < new Date()).length;
    const openComms = localComments.filter(c => c.status === 'Open' || c.status === 'Responded').length;
    const criticalComms = localComments.filter(c => c.severity === 'Critical' && c.status !== 'Closed').length;

    // Report chart aggregations
    const stageDistribution = [
      { name: 'Draft', value: localReviews.filter(r => r.stage === 'Draft').length },
      { name: 'In Review', value: localReviews.filter(r => r.stage === 'In Review').length },
      { name: 'Verification', value: localReviews.filter(r => r.stage === 'Verification').length },
      { name: 'Closed', value: localReviews.filter(r => r.stage === 'Closed').length }
    ];

    return {
      activeReviews: active,
      overdueReviews: overdue,
      openComments: openComms,
      criticalComments: criticalComms,
      stageDistribution
    };
  },
  
  async getReviews() {
    try {
      const { data, error } = await supabase.from('peer_reviews').select('*').order('created_at', { ascending: false });
      if (error || !data || data.length === 0) throw new Error("No DB data");
      return data;
    } catch (e) {
      return localReviews; // Fallback to robust mock data
    }
  },

  async getReviewById(id) {
    try {
      const { data, error } = await supabase.from('peer_reviews').select('*').eq('id', id).single();
      if (error || !data) throw new Error("Not found");
      return data;
    } catch (e) {
      return localReviews.find(r => r.id === id) || null;
    }
  },

  async getComments(reviewId) {
    try {
      const { data, error } = await supabase.from('peer_review_comments').select('*').eq('review_id', reviewId).order('created_at', { ascending: false });
      if (error || !data || data.length === 0) throw new Error("No comments");
      return data;
    } catch (e) {
      return localComments.filter(c => c.review_id === reviewId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    }
  },

  async getAuditTrail(reviewId) {
    return localAudit.filter(a => a.review_id === reviewId).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  async saveReview(data) {
    const newId = 'rev-' + Math.floor(Math.random() * 10000);
    const newReview = {
      id: newId,
      review_code: `PR-2026-${Math.floor(Math.random() * 900 + 100)}`,
      stage: 'Draft',
      decision: 'Pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      team: [],
      deliverables: [],
      attachments: [],
      ...data
    };
    localReviews.unshift(newReview);
    this.logAudit(newId, 'System', 'Created Review', 'Initial Draft creation');
    return newReview;
  },

  async addComment(reviewId, commentData) {
    const newId = 'com-' + Math.floor(Math.random() * 10000);
    const newComment = {
      id: newId,
      review_id: reviewId,
      status: 'Open',
      responded_text: '',
      created_at: new Date().toISOString(),
      ...commentData
    };
    localComments.unshift(newComment);
    this.logAudit(reviewId, commentData.author || 'User', 'Added Comment', `Added ${commentData.severity} comment`);
    return newComment;
  },

  async updateCommentStatus(commentId, updates) {
    const idx = localComments.findIndex(c => c.id === commentId);
    if (idx !== -1) {
      localComments[idx] = { ...localComments[idx], ...updates };
      const reviewId = localComments[idx].review_id;
      this.logAudit(reviewId, 'User', 'Updated Comment', `Status changed to ${updates.status || 'updated'}`);
    }
    return localComments[idx];
  },

  async updateReviewStage(reviewId, newStage) {
    const idx = localReviews.findIndex(r => r.id === reviewId);
    if (idx !== -1) {
      localReviews[idx].stage = newStage;
      this.logAudit(reviewId, 'User', 'Changed Stage', `Moved to ${newStage}`);
    }
    return localReviews[idx];
  },

  logAudit(reviewId, actor, action, details) {
    localAudit.unshift({
      id: 'a-' + Math.floor(Math.random()*10000),
      review_id: reviewId,
      actor,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  }
};