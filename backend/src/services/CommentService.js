/**
 * CommentService
 * Handles market comment storage and operations
 * Uses in-memory storage with optional database persistence
 */

import { Comment } from '../models/Comment.js';
import { db } from './DatabaseService.js';

class CommentService {
  constructor() {
    // In-memory storage for comments
    this.comments = new Map();
    this.commentCounter = 0;
    
    // User interaction tracking (userId -> Set of commentIds)
    this.userLikes = new Map();
    this.userDislikes = new Map();
    
    // Initialize database schema
    this._initializeDatabase();
  }

  /**
   * Initialize comment database schema
   */
  _initializeDatabase() {
    if (!db.db) return;

    db.db.exec(`
      CREATE TABLE IF NOT EXISTS market_comments (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL,
        username          TEXT NOT NULL,
        user_avatar       TEXT NOT NULL DEFAULT '',
        is_pro            INTEGER NOT NULL DEFAULT 0,
        content           TEXT NOT NULL,
        sentiment         TEXT NOT NULL DEFAULT 'bullish',
        timeframe         TEXT NOT NULL DEFAULT '',
        market            TEXT NOT NULL DEFAULT 'indian',
        timestamp         TEXT NOT NULL,
        likes             INTEGER NOT NULL DEFAULT 0,
        dislikes          INTEGER NOT NULL DEFAULT 0,
        parent_id         TEXT DEFAULT NULL,
        is_edited         INTEGER NOT NULL DEFAULT 0,
        edited_at         TEXT DEFAULT NULL,
        is_reported       INTEGER NOT NULL DEFAULT 0,
        report_count      INTEGER NOT NULL DEFAULT 0,
        liked_by          TEXT NOT NULL DEFAULT '[]',
        disliked_by       TEXT NOT NULL DEFAULT '[]',
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        
        FOREIGN KEY (parent_id) REFERENCES market_comments(id) ON DELETE CASCADE
      );
    `);

    // Safely add columns if table existed prior
    try { db.db.exec(`ALTER TABLE market_comments ADD COLUMN sentiment TEXT DEFAULT 'bullish'`); } catch (e) {}
    try { db.db.exec(`ALTER TABLE market_comments ADD COLUMN timeframe TEXT DEFAULT ''`); } catch (e) {}
    try { db.db.exec(`ALTER TABLE market_comments ADD COLUMN market TEXT DEFAULT 'indian'`); } catch (e) {}

    db.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_comments_timestamp
        ON market_comments (timestamp DESC);
    `);

    db.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_comments_likes
        ON market_comments (likes DESC);
    `);

    db.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_comments_parent
        ON market_comments (parent_id);
    `);

    db.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_comments_market
        ON market_comments (market);
    `);

    console.log('[CommentService] Database schema initialized');
    
    // Load existing comments from database
    this._loadFromDatabase();
  }

  /**
   * Load comments from database into memory
   */
  _loadFromDatabase() {
    if (!db.db) return;

    try {
      const rows = db.db
        .prepare('SELECT * FROM market_comments ORDER BY timestamp DESC')
        .all();

      for (const row of rows) {
        const comment = new Comment({
          id: row.id,
          userId: row.user_id,
          username: row.username,
          userAvatar: row.user_avatar,
          isPro: row.is_pro === 1,
          content: row.content,
          sentiment: row.sentiment || 'bullish',
          timeframe: row.timeframe || '',
          market: row.market || 'indian',
          timestamp: row.timestamp,
          likes: row.likes,
          dislikes: row.dislikes,
          parentId: row.parent_id,
          isEdited: row.is_edited === 1,
          editedAt: row.edited_at,
          isReported: row.is_reported === 1,
          reportCount: row.report_count,
          likedBy: JSON.parse(row.liked_by || '[]'),
          dislikedBy: JSON.parse(row.disliked_by || '[]'),
        });

        this.comments.set(comment.id, comment);
        
        // Update counter to avoid ID collision
        const numId = parseInt(comment.id.replace('comment_', ''));
        if (!isNaN(numId) && numId > this.commentCounter) {
          this.commentCounter = numId;
        }
      }

      console.log(`[CommentService] Loaded ${this.comments.size} comments from database`);
    } catch (error) {
      console.error('[CommentService] Error loading comments from database:', error);
    }
  }

  /**
   * Persist comment to database
   */
  _persistToDatabase(comment) {
    if (!db.db) return;

    try {
      const stmt = db.db.prepare(`
        INSERT INTO market_comments (
          id, user_id, username, user_avatar, is_pro, content, sentiment, timeframe, market,
          timestamp, likes, dislikes, parent_id, is_edited, edited_at,
          is_reported, report_count, liked_by, disliked_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          sentiment = excluded.sentiment,
          timeframe = excluded.timeframe,
          market = excluded.market,
          likes = excluded.likes,
          dislikes = excluded.dislikes,
          is_edited = excluded.is_edited,
          edited_at = excluded.edited_at,
          is_reported = excluded.is_reported,
          report_count = excluded.report_count,
          liked_by = excluded.liked_by,
          disliked_by = excluded.disliked_by
      `);

      stmt.run(
        comment.id,
        comment.userId,
        comment.username,
        comment.userAvatar,
        comment.isPro ? 1 : 0,
        comment.content,
        comment.sentiment || 'bullish',
        comment.timeframe || '',
        comment.market || 'indian',
        comment.timestamp,
        comment.likes,
        comment.dislikes,
        comment.parentId,
        comment.isEdited ? 1 : 0,
        comment.editedAt,
        comment.isReported ? 1 : 0,
        comment.reportCount,
        JSON.stringify(comment.likedBy || []),
        JSON.stringify(comment.dislikedBy || [])
      );
    } catch (error) {
      console.error('[CommentService] Error persisting comment to database:', error);
    }
  }

  /**
   * Delete comment from database
   */
  _deleteFromDatabase(commentId) {
    if (!db.db) return;

    try {
      db.db.prepare('DELETE FROM market_comments WHERE id = ?').run(commentId);
    } catch (error) {
      console.error('[CommentService] Error deleting comment from database:', error);
    }
  }

  /**
   * Create a new comment
   */
  createComment(userId, username, content, userAvatar = '', isPro = false, parentId = null, sentiment = 'bullish', timeframe = '', market = 'indian') {
    // Sanitize content
    const sanitizedContent = Comment.sanitize(content);

    const comment = new Comment({
      id: `comment_${++this.commentCounter}`,
      userId,
      username,
      userAvatar,
      isPro,
      content: sanitizedContent,
      sentiment: sentiment || 'bullish',
      timeframe: timeframe || '',
      market: market || 'indian',
      timestamp: new Date().toISOString(),
      parentId,
    });

    const validation = comment.isValid();
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // If it's a reply, add to parent's replies array
    if (parentId) {
      const parentComment = this.comments.get(parentId);
      if (!parentComment) {
        throw new Error('Parent comment not found');
      }
      parentComment.replies.push(comment.id);
      this._persistToDatabase(parentComment);
    }

    this.comments.set(comment.id, comment);
    this._persistToDatabase(comment);

    return comment;
  }

  /**
   * Get comments with pagination and sorting
   */
  getComments(options = {}) {
    const {
      sort = 'recent',
      page = 1,
      limit = 20,
      parentId = null,
      market = 'indian',
      sentiment = null,
    } = options;

    // Filter top-level comments (no parent) or replies to specific comment
    let commentList = Array.from(this.comments.values()).filter(c => {
      if (parentId) {
        return c.parentId === parentId;
      }
      const matchMarket = market ? (c.market === market || (!c.market && market === 'indian')) : true;
      const matchSentiment = sentiment && sentiment !== 'all' ? c.sentiment === sentiment : true;
      return !c.parentId && matchMarket && matchSentiment;
    });

    // Sort
    if (sort === 'liked') {
      commentList.sort((a, b) => b.likes - a.likes);
    } else {
      commentList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedComments = commentList.slice(startIndex, endIndex);

    // Load replies for each comment
    const commentsWithReplies = paginatedComments.map(comment => {
      const commentData = comment.toPublicJSON();
      commentData.replies = (comment.replies || []).map(replyId => {
        const reply = this.comments.get(replyId);
        return reply ? reply.toPublicJSON() : null;
      }).filter(r => r !== null);
      return commentData;
    });

    return {
      comments: commentsWithReplies,
      pagination: {
        page,
        limit,
        total: commentList.length,
        hasMore: endIndex < commentList.length,
      },
    };
  }

  /**
   * Get a single comment by ID
   */
  getComment(commentId) {
    return this.comments.get(commentId);
  }

  /**
   * Update comment content
   */
  updateComment(commentId, userId, newContent) {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new Error('Unauthorized: You can only edit your own comments');
    }

    const sanitizedContent = Comment.sanitize(newContent);
    if (sanitizedContent.length === 0) {
      throw new Error('Comment cannot be empty');
    }
    if (sanitizedContent.length > 2000) {
      throw new Error('Comment exceeds 2000 character limit');
    }

    comment.content = sanitizedContent;
    comment.isEdited = true;
    comment.editedAt = new Date().toISOString();

    this._persistToDatabase(comment);

    return comment;
  }

  /**
   * Delete a comment
   */
  deleteComment(commentId, userId) {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new Error('Unauthorized: You can only delete your own comments');
    }

    // Delete all replies first
    for (const replyId of (comment.replies || [])) {
      this.comments.delete(replyId);
      this._deleteFromDatabase(replyId);
    }

    // If this is a reply, remove from parent's replies array
    if (comment.parentId) {
      const parentComment = this.comments.get(comment.parentId);
      if (parentComment) {
        parentComment.replies = parentComment.replies.filter(id => id !== commentId);
        this._persistToDatabase(parentComment);
      }
    }

    this.comments.delete(commentId);
    this._deleteFromDatabase(commentId);

    return true;
  }

  /**
   * Like a comment
   */
  likeComment(commentId, userId) {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    // Remove from dislike if previously disliked
    const dislikeIndex = comment.dislikedBy.indexOf(userId);
    if (dislikeIndex !== -1) {
      comment.dislikedBy.splice(dislikeIndex, 1);
      comment.dislikes = Math.max(0, comment.dislikes - 1);
    }

    // Toggle like
    const likeIndex = comment.likedBy.indexOf(userId);
    if (likeIndex === -1) {
      comment.likedBy.push(userId);
      comment.likes++;
    } else {
      comment.likedBy.splice(likeIndex, 1);
      comment.likes = Math.max(0, comment.likes - 1);
    }

    this._persistToDatabase(comment);

    return {
      likes: comment.likes,
      dislikes: comment.dislikes,
      userLiked: comment.likedBy.includes(userId),
      userDisliked: comment.dislikedBy.includes(userId),
    };
  }

  /**
   * Dislike a comment
   */
  dislikeComment(commentId, userId) {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    // Remove from like if previously liked
    const likeIndex = comment.likedBy.indexOf(userId);
    if (likeIndex !== -1) {
      comment.likedBy.splice(likeIndex, 1);
      comment.likes = Math.max(0, comment.likes - 1);
    }

    // Toggle dislike
    const dislikeIndex = comment.dislikedBy.indexOf(userId);
    if (dislikeIndex === -1) {
      comment.dislikedBy.push(userId);
      comment.dislikes++;
    } else {
      comment.dislikedBy.splice(dislikeIndex, 1);
      comment.dislikes = Math.max(0, comment.dislikes - 1);
    }

    this._persistToDatabase(comment);

    return {
      likes: comment.likes,
      dislikes: comment.dislikes,
      userLiked: comment.likedBy.includes(userId),
      userDisliked: comment.dislikedBy.includes(userId),
    };
  }

  /**
   * Report a comment
   */
  reportComment(commentId, userId) {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.userId === userId) {
      throw new Error('You cannot report your own comment');
    }

    comment.isReported = true;
    comment.reportCount++;

    this._persistToDatabase(comment);

    console.log(`[CommentService] Comment ${commentId} reported by user ${userId}. Total reports: ${comment.reportCount}`);

    return {
      success: true,
      message: 'Comment reported successfully',
    };
  }

  /**
   * Get user's interaction status for comments
   */
  getUserInteractions(userId, commentIds) {
    const interactions = {};

    for (const commentId of commentIds) {
      const comment = this.comments.get(commentId);
      if (comment) {
        interactions[commentId] = {
          liked: (comment.likedBy || []).includes(userId),
          disliked: (comment.dislikedBy || []).includes(userId),
        };
      }
    }

    return interactions;
  }
}

// Singleton
export const commentService = new CommentService();
