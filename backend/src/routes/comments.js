/**
 * Comments Routes
 * API endpoints for market comments and community discussion
 */

import { Router } from 'express';
import { commentService } from '../services/CommentService.js';
import { supportService } from '../services/SupportService.js';

const router = Router();

/**
 * Strict authentication middleware
 * Cryptographically verifies tokens and rejects unauthenticated requests with 401 Unauthorized
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    const userId = req.headers['x-user-id'];
    const username = req.headers['x-username'];

    // Development-only fallback
    if (
      process.env.NODE_ENV !== 'production' &&
      !authHeader &&
      userId &&
      userId.toLowerCase() !== 'guest' &&
      userId.toLowerCase() !== 'anonymous'
    ) {
      req.user = {
        id: String(userId).trim(),
        username: username || req.headers['x-user-name'] || 'Trader',
        avatar: req.headers['x-user-avatar'] || '',
        isPro: req.headers['x-user-pro'] === 'true' || false,
      };
      return next();
    }

    // Production and normal authentication path
    let token = null;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-supabase-token']) {
      token = String(req.headers['x-supabase-token']).trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in or sign up to comment.',
      });
    }

    const { user, error } = await supportService.verifyUserToken(token);
    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token. Please log in again.',
      });
    }

    req.user = {
      id: user.id,
      username: user.user_metadata?.full_name || user.email?.split('@')[0] || username || 'Trader',
      avatar: user.user_metadata?.avatar_url || req.headers['x-user-avatar'] || '',
      isPro: user.app_metadata?.is_pro === true || false,
    };

    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.',
    });
  }
};

/**
 * GET /api/market/comments
 * Get paginated comments with sorting and market filter
 */
router.get('/comments', (req, res) => {
  try {
    const {
      sort = 'recent',
      page = 1,
      limit = 20,
      parentId = null,
      market = 'indian',
      sentiment = null,
    } = req.query;

    const result = commentService.getComments({
      sort,
      page: parseInt(page),
      limit: parseInt(limit),
      parentId,
      market,
      sentiment,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Comments API] Error fetching comments:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/market/comments
 * Create a new comment
 */
router.post('/comments', requireAuth, (req, res) => {
  try {
    const { content, parentId = null, sentiment = 'bullish', timeframe = '', market = 'indian' } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required',
      });
    }

    if (content.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Comment exceeds 2000 character limit',
      });
    }

    const comment = commentService.createComment(
      req.user.id,
      req.user.username,
      content,
      req.user.avatar,
      req.user.isPro,
      parentId,
      sentiment,
      timeframe,
      market
    );

    res.status(201).json({
      success: true,
      message: 'Comment posted successfully',
      data: comment.toPublicJSON(),
    });
  } catch (error) {
    console.error('[Comments API] Error creating comment:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/market/comments/:id
 * Update an existing comment
 */
router.put('/comments/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required',
      });
    }

    const comment = commentService.updateComment(id, req.user.id, content);

    res.json({
      success: true,
      message: 'Comment updated successfully',
      data: comment.toPublicJSON(),
    });
  } catch (error) {
    console.error('[Comments API] Error updating comment:', error);
    
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }
    
    if (error.message === 'Comment not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/market/comments/:id
 * Delete a comment
 */
router.delete('/comments/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;

    commentService.deleteComment(id, req.user.id);

    res.json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    console.error('[Comments API] Error deleting comment:', error);
    
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }
    
    if (error.message === 'Comment not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/market/comments/:id/like
 * Like a comment (toggle)
 */
router.post('/comments/:id/like', requireAuth, (req, res) => {
  try {
    const { id } = req.params;

    const result = commentService.likeComment(id, req.user.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Comments API] Error liking comment:', error);
    
    if (error.message === 'Comment not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/market/comments/:id/dislike
 * Dislike a comment (toggle)
 */
router.post('/comments/:id/dislike', requireAuth, (req, res) => {
  try {
    const { id } = req.params;

    const result = commentService.dislikeComment(id, req.user.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Comments API] Error disliking comment:', error);
    
    if (error.message === 'Comment not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/market/comments/:id/reply
 * Reply to a comment (shorthand for POST /comments with parentId)
 */
router.post('/comments/:id/reply', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Reply content is required',
      });
    }

    // Verify parent comment exists
    const parentComment = commentService.getComment(id);
    if (!parentComment) {
      return res.status(404).json({
        success: false,
        error: 'Parent comment not found',
      });
    }

    const reply = commentService.createComment(
      req.user.id,
      req.user.username,
      content,
      req.user.avatar,
      req.user.isPro,
      id, // parentId
      parentComment.sentiment || 'neutral',
      '',
      parentComment.market || 'indian'
    );

    res.status(201).json({
      success: true,
      message: 'Reply posted successfully',
      data: reply.toPublicJSON(),
    });
  } catch (error) {
    console.error('[Comments API] Error creating reply:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/market/comments/:id/report
 * Report a comment
 */
router.post('/comments/:id/report', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Inappropriate content' } = req.body;

    const result = commentService.reportComment(id, req.user.id);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('[Comments API] Error reporting comment:', error);
    
    if (error.message === 'Comment not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/market/comments/:id
 * Get a single comment with its replies
 */
router.get('/comments/:id', (req, res) => {
  try {
    const { id } = req.params;

    const comment = commentService.getComment(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found',
      });
    }

    // Load replies
    const commentData = comment.toPublicJSON();
    commentData.replies = comment.replies.map(replyId => {
      const reply = commentService.getComment(replyId);
      return reply ? reply.toPublicJSON() : null;
    }).filter(r => r !== null);

    res.json({
      success: true,
      data: commentData,
    });
  } catch (error) {
    console.error('[Comments API] Error fetching comment:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
