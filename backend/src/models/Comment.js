/**
 * Comment Model
 * Market comment/discussion data structure
 */

export class Comment {
  constructor(data = {}) {
    this.id = data.id || '';
    this.userId = data.userId || '';
    this.username = data.username || 'Anonymous';
    this.userAvatar = data.userAvatar || '';
    this.isPro = data.isPro || false;
    this.content = data.content || '';
    this.sentiment = data.sentiment || 'bullish';
    this.timeframe = data.timeframe || '';
    this.market = data.market || 'indian';
    this.timestamp = data.timestamp || new Date().toISOString();
    this.likes = data.likes || 0;
    this.dislikes = data.dislikes || 0;
    this.replies = data.replies || [];
    this.parentId = data.parentId || null;
    this.isEdited = data.isEdited || false;
    this.editedAt = data.editedAt || null;
    this.isReported = data.isReported || false;
    this.reportCount = data.reportCount || 0;
    this.likedBy = data.likedBy || [];
    this.dislikedBy = data.dislikedBy || [];
  }

  /**
   * Sanitize comment content to prevent XSS
   */
  static sanitize(content) {
    if (!content) return '';
    
    // Remove HTML tags
    let sanitized = content.replace(/<[^>]*>/g, '');
    
    // Escape special characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
    
    return sanitized.trim();
  }

  /**
   * Validate comment data
   */
  isValid() {
    if (!this.content || this.content.trim().length === 0) {
      return { valid: false, error: 'Comment cannot be empty' };
    }
    
    if (this.content.length > 2000) {
      return { valid: false, error: 'Comment exceeds 2000 character limit' };
    }
    
    if (!this.userId) {
      return { valid: false, error: 'User ID is required' };
    }
    
    return { valid: true };
  }

  /**
   * Get relative time string
   */
  getRelativeTime() {
    const now = new Date();
    const commentDate = new Date(this.timestamp);
    const diffMs = now - commentDate;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return commentDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      username: this.username,
      userAvatar: this.userAvatar,
      isPro: this.isPro,
      content: this.content,
      sentiment: this.sentiment,
      timeframe: this.timeframe,
      market: this.market,
      timestamp: this.timestamp,
      likes: this.likes,
      dislikes: this.dislikes,
      replies: this.replies,
      parentId: this.parentId,
      isEdited: this.isEdited,
      editedAt: this.editedAt,
      isReported: this.isReported,
      reportCount: this.reportCount,
      relativeTime: this.getRelativeTime(),
    };
  }

  /**
   * Convert to public JSON (without sensitive data)
   */
  toPublicJSON() {
    return {
      id: this.id,
      username: this.username,
      userAvatar: this.userAvatar,
      isPro: this.isPro,
      content: this.content,
      sentiment: this.sentiment,
      timeframe: this.timeframe,
      market: this.market,
      timestamp: this.timestamp,
      likes: this.likes,
      dislikes: this.dislikes,
      replies: this.replies,
      parentId: this.parentId,
      isEdited: this.isEdited,
      editedAt: this.editedAt,
      relativeTime: this.getRelativeTime(),
    };
  }
}
