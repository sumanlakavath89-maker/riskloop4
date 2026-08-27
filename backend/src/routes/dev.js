/**
 * Development Routes
 * Test endpoints for development only
 * REMOVE IN PRODUCTION
 */

import express from 'express';
import { brokerService } from '../services/BrokerService.js';
import { indiaCalendarScheduleService } from '../services/IndiaCalendarScheduleService.js';
import { supabaseEconomicCalendarService } from '../services/SupabaseEconomicCalendarService.js';
import { officialReleaseIngestionService } from '../services/OfficialReleaseIngestionService.js';
import { calendarSchedulerService } from '../services/CalendarSchedulerService.js';
import { economicCalendarAlertService } from '../services/EconomicCalendarAlertService.js';
import { economicCalendarIncidentService } from '../services/EconomicCalendarIncidentService.js';
import { forexOfficialSourceDiscoveryService } from '../services/forex/ForexOfficialSourceDiscoveryService.js';

const router = express.Router();

// Disable in production
if (process.env.NODE_ENV === 'production') {
  router.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Development endpoints disabled in production',
    });
  });
} else {
  /**
   * GET /api/dev/economic-calendar/india-schedule
   * Generate upcoming official Indian economic calendar events for the next 90 days
   * 
   * Query params:
   *   ?daysAhead=90
   *   ?from=YYYY-MM-DD
   *   ?to=YYYY-MM-DD
   *   ?eventName=CPI Inflation | IIP | WPI Inflation | RBI Monetary Policy / Repo Rate | GDP
   */
  router.get('/economic-calendar/india-schedule', (req, res) => {
    try {
      const { daysAhead = 90, from, to, eventName } = req.query;

      const result = indiaCalendarScheduleService.generateUpcomingEvents({
        daysAhead: parseInt(daysAhead, 10),
        from,
        to,
        eventName
      });

      return res.status(200).json(result);
    } catch (err) {
      console.error('[DevRoutes] Error generating India economic calendar schedule:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate schedule',
        message: err.message
      });
    }
  });

  /**
   * GET /api/dev/forex-calendar/discover
   * Run official source discovery (BLS, BEA) in safe discovery-only mode (Zero DB mutations)
   */
  router.get('/forex-calendar/discover', async (req, res) => {
    try {
      const { daysAhead = 60, from, to } = req.query;
      const result = await forexOfficialSourceDiscoveryService.discoverOfficialEvents({
        daysAhead: parseInt(daysAhead, 10),
        from,
        to
      });

      return res.status(200).json(result);
    } catch (err) {
      console.error('[DevRoutes] Error running Forex official source discovery:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to discover official Forex events',
        message: err.message
      });
    }
  });

  /**
   * GET /api/dev/economic-calendar/check-duplicates
   * Check for duplicate rows in Supabase economic_events before constraint creation
   */
  router.get('/economic-calendar/check-duplicates', async (req, res) => {
    try {
      const result = await supabaseEconomicCalendarService.checkForDuplicateEvents();
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      console.error('[DevRoutes] Error checking duplicate economic events:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to check duplicates',
        message: err.message
      });
    }
  });

  /**
   * POST /api/dev/economic-calendar/sync-india
   * Persist generated Indian economic calendar events to Supabase economic_events table
   * 
   * Body / Query:
   *   { daysAhead: 90, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
   */
  router.post('/economic-calendar/sync-india', async (req, res) => {
    try {
      const daysAhead = req.body?.daysAhead || req.query?.daysAhead || 90;
      const from = req.body?.from || req.query?.from;
      const to = req.body?.to || req.query?.to;

      const result = await supabaseEconomicCalendarService.syncUpcomingIndiaEvents(
        parseInt(daysAhead, 10),
        { from, to }
      );

      return res.status(200).json(result);
    } catch (err) {
      console.error('[DevRoutes] Error syncing India economic events:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to sync India economic calendar',
        message: err.message
      });
    }
  });

  /**
   * POST /api/dev/economic-calendar/ingest-release
   * Test official release ingestion & automatic Supabase actuals/status update
   * 
   * Body:
   *   {
   *     title: string,
   *     content: string,
   *     url: string,
   *     source: string,
   *     releaseDate: 'YYYY-MM-DD' (optional)
   *   }
   */
  router.post('/economic-calendar/ingest-release', async (req, res) => {
    try {
      const payload = req.body || {};
      const result = await officialReleaseIngestionService.ingestSingleRelease(payload);
      return res.status(200).json(result);
    } catch (err) {
      console.error('[DevRoutes] Error ingesting official release:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to ingest official release',
        message: err.message
      });
    }
  });

  /**
   * POST /api/dev/economic-calendar/scheduler/run
   * Manually execute one complete scheduler cycle
   * 
   * Body / Query: { dryRun: boolean }
   */
  router.post('/economic-calendar/scheduler/run', async (req, res) => {
    try {
      const dryRun = req.body?.dryRun === true || req.query?.dryRun === 'true';
      const result = await calendarSchedulerService.runSchedulerCycle({ dryRun, isManual: true });
      return res.status(200).json(result);
    } catch (err) {
      console.error('[DevRoutes] Error executing scheduler cycle:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to execute scheduler cycle',
        message: err.message
      });
    }
  });

  /**
   * GET /api/dev/economic-calendar/scheduler/status
   * Get current scheduler status, active jobs, and last run summary
   */
  router.get('/economic-calendar/scheduler/status', (req, res) => {
    try {
      const status = calendarSchedulerService.getStatus();
      return res.status(200).json({
        success: true,
        ...status
      });
    } catch (err) {
      console.error('[DevRoutes] Error fetching scheduler status:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch scheduler status',
        message: err.message
      });
    }
  });

  /**
   * POST /api/dev/economic-calendar/alerts/check
   * Trigger on-demand health check and state transition alerting evaluation
   */
  router.post('/economic-calendar/alerts/check', async (req, res) => {
    try {
      const bypassCooldown = req.body?.bypassCooldown === true || req.query?.bypassCooldown === 'true';
      const result = await economicCalendarAlertService.checkHealthAndAlert({ bypassCooldown });
      return res.status(200).json(result);
    } catch (err) {
      console.error('[DevRoutes] Error evaluating alerts:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to check alerts',
        message: err.message
      });
    }
  });

  /**
   * GET /api/dev/economic-calendar/alerts/history
   * Get recent alert history
   */
  router.get('/economic-calendar/alerts/history', (req, res) => {
    try {
      const limit = parseInt(req.query?.limit, 10) || 20;
      const history = economicCalendarAlertService.getAlertHistory(limit);
      return res.status(200).json({
        success: true,
        count: history.length,
        history
      });
    } catch (err) {
      console.error('[DevRoutes] Error fetching alert history:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch alert history',
        message: err.message
      });
    }
  });

  /**
   * GET /api/dev/economic-calendar/incidents
   * Get list of active or historical incidents
   */
  router.get('/economic-calendar/incidents', async (req, res) => {
    try {
      const limit = parseInt(req.query?.limit, 10) || 20;
      const activeOnly = req.query?.active === 'true';
      const incidents = activeOnly
        ? await economicCalendarIncidentService.getActiveIncidents()
        : await economicCalendarIncidentService.getIncidentHistory(limit);

      return res.status(200).json({
        success: true,
        count: incidents.length,
        incidents
      });
    } catch (err) {
      console.error('[DevRoutes] Error fetching incidents:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch incidents',
        message: err.message
      });
    }
  });

  /**
   * POST /api/dev/economic-calendar/incidents/:id/acknowledge
   * Acknowledge an open incident
   */
  router.post('/economic-calendar/incidents/:id/acknowledge', async (req, res) => {
    try {
      const acknowledgedBy = req.body?.acknowledgedBy || 'dev-admin';
      const incident = await economicCalendarIncidentService.acknowledgeIncident(req.params.id, acknowledgedBy);

      if (!incident) {
        return res.status(404).json({ success: false, error: 'Incident not found' });
      }

      return res.status(200).json({ success: true, incident });
    } catch (err) {
      console.error('[DevRoutes] Error acknowledging incident:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to acknowledge incident',
        message: err.message
      });
    }
  });

  /**
   * POST /api/dev/economic-calendar/incidents/:id/resolve
   * Manually resolve an incident
   */
  router.post('/economic-calendar/incidents/:id/resolve', async (req, res) => {
    try {
      const notes = req.body?.notes || 'Resolved manually via dev endpoint';
      const incident = await economicCalendarIncidentService.resolveIncident(req.params.id, notes);

      if (!incident) {
        return res.status(404).json({ success: false, error: 'Incident not found' });
      }

      return res.status(200).json({ success: true, incident });
    } catch (err) {
      console.error('[DevRoutes] Error resolving incident:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to resolve incident',
        message: err.message
      });
    }
  });




  /**
   * POST /api/dev/angelone/test-connection
   * Test Angel One connection and fetch basic profile
   * 
   * Body: {
   *   clientId: string (optional, uses env if not provided),
   *   mpin: string (optional, uses env if not provided)
   * }
   */
  router.post('/angelone/test-connection', async (req, res) => {
    try {
      console.log('\n🧪 Testing Angel One Connection...\n');
      
      const { clientId, mpin } = req.body;
      
      // Create adapter instance
      const sessionId = 'dev-test-' + Date.now();
      const adapter = brokerService.getAdapter(sessionId, 'angelone');
      
      // Test connection
      console.log('1️⃣ Attempting authentication...');
      const connected = await adapter.connect({ clientId, mpin });
      
      if (!connected) {
        return res.status(401).json({
          success: false,
          error: 'Authentication failed',
        });
      }
      
      console.log('✅ Authentication successful\n');
      
      // Test profile fetch
      console.log('2️⃣ Fetching user profile...');
      const profile = await adapter.getProfile();
      console.log('✅ Profile fetched\n');
      
      // Test funds fetch
      console.log('3️⃣ Fetching funds...');
      const funds = await adapter.getFunds();
      console.log('✅ Funds fetched\n');
      
      // Disconnect
      console.log('4️⃣ Disconnecting...');
      await adapter.disconnect();
      console.log('✅ Disconnected\n');
      
      // Return sanitized results (no tokens)
      res.json({
        success: true,
        message: 'Angel One connection test successful',
        data: {
          connected: true,
          profile: {
            userId: profile.userId,
            name: profile.name,
            email: profile.email,
            exchanges: profile.exchanges,
            products: profile.products,
            // DO NOT SEND: tokens, raw credentials
          },
          funds: {
            availableMargin: funds.availableMargin,
            usedMargin: funds.usedMargin,
            totalMargin: funds.totalMargin,
          },
        },
      });
      
      // Cleanup
      brokerService.removeAdapter(sessionId, 'angelone');
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      
      res.status(500).json({
        success: false,
        error: error.message,
        hint: 'Check your environment variables in .env file',
      });
    }
  });

  /**
   * GET /api/dev/angelone/check-config
   * Check if Angel One environment variables are configured
   */
  router.get('/angelone/check-config', (req, res) => {
    const config = {
      apiKey: !!process.env.ANGELONE_API_KEY,
      clientId: !!process.env.ANGELONE_CLIENT_ID,
      mpin: !!process.env.ANGELONE_MPIN,
      totpSecret: !!process.env.ANGELONE_TOTP_SECRET,
    };
    
    const allConfigured = Object.values(config).every(v => v === true);
    
    res.json({
      success: true,
      configured: allConfigured,
      details: config,
      message: allConfigured 
        ? 'All Angel One environment variables are configured'
        : 'Some Angel One environment variables are missing',
    });
  });
}

export default router;

