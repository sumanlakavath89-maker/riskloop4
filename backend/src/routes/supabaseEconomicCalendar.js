import { Router } from 'express';
import { supabaseEconomicCalendarService } from '../services/SupabaseEconomicCalendarService.js';

const router = Router();

// Disable test endpoint in production
if (process.env.NODE_ENV === 'production') {
  router.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
    });
  });
}

/**
 * GET /api/test-economic-calendar
 * Temporary test route for Supabase economic_events
 */
router.get('/', async (req, res) => {
    try {
        const events = await supabaseEconomicCalendarService.getEvents({
            countryCode: req.query.countryCode || 'IN',
            impact: req.query.impact,
            from: req.query.from,
            to: req.query.to,
            limit: req.query.limit
        });

        return res.status(200).json({
            success: true,
            count: events.length,
            events
        });
    } catch (error) {
        console.error('Supabase economic calendar error:', error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;