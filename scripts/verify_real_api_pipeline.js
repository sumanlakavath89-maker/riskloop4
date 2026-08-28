/**
 * Real Data Pipeline Verification Script
 * Traces IIP and GDP through the full real database, sync, and API response lifecycle.
 */

import { supabaseEconomicCalendarService } from '../backend/src/services/SupabaseEconomicCalendarService.js';
import { indiaOfficialEconomicCalendarService } from '../backend/src/services/IndiaOfficialEconomicCalendarService.js';
import { globalEconomicCalendarService } from '../backend/src/services/forex/GlobalEconomicCalendarService.js';

async function run() {
  console.log('===============================================================');
  console.log('🔍 TRACING REAL DATA PIPELINE: IIP (28 Aug) & GDP (31 Aug)');
  console.log('===============================================================\n');

  // Step 1: Sync official schedules and historical baselines into database
  console.log('📌 STEP 1: Running Sync to Update Real Database Records...');
  const syncRes = await supabaseEconomicCalendarService.syncUpcomingIndiaEvents(90);
  console.log('   Sync Status:', syncRes.message);

  // Step 2: Query Real Database Records
  console.log('\n📌 STEP 2: Querying Real Database Records (public.economic_events)...');
  const dbEvents = await supabaseEconomicCalendarService.getEvents({});

  const targets = [
    { name: 'IIP', date: '2026-08-28' },
    { name: 'GDP', date: '2026-08-31' }
  ];

  for (const target of targets) {
    const dbRow = dbEvents.find(e => e.event_name === target.name && String(e.event_date).startsWith(target.date));

    console.log('\n---------------------------------------------------------------');
    console.log(`EVENT ID:           ${dbRow ? dbRow.id : 'NOT_FOUND'}`);
    console.log(`EVENT NAME:         ${target.name}`);
    console.log(`SOURCE:             ${dbRow ? dbRow.source : 'MoSPI'}`);
    console.log(`RAW DB OBJECT:      ${JSON.stringify(dbRow)}`);
    console.log(`DATABASE PREVIOUS:  ${dbRow ? dbRow.previous : 'NULL'}`);
    console.log(`DATABASE FORECAST:  ${dbRow ? dbRow.forecast : 'NULL'}`);
    console.log(`DATABASE ACTUAL:    ${dbRow ? dbRow.actual : 'NULL'}`);
  }

  // Step 3: Query Real India Economic Calendar API Output (GET /api/market/economic-calendar)
  console.log('\n📌 STEP 3: Querying Indian Calendar API Service (/api/market/economic-calendar)...');
  const apiRes = await indiaOfficialEconomicCalendarService.getEconomicCalendar({ period: 'all', forceRefresh: true });

  for (const target of targets) {
    const apiEvent = apiRes.events.find(e => (e.event === target.name || e.event.includes(target.name)) && e.date === target.date);

    console.log('\n---------------------------------------------------------------');
    console.log(`API EVENT NAME:     ${target.name} (${target.date})`);
    console.log(`API PREVIOUS:       ${apiEvent ? apiEvent.previous : 'MISSING'}`);
    console.log(`API FORECAST:       ${apiEvent ? apiEvent.forecast : 'MISSING'}`);
    console.log(`API ACTUAL:         ${apiEvent ? apiEvent.actual : 'MISSING'}`);
    console.log(`API RAW PREVIOUS:   ${apiEvent ? apiEvent.rawPrevious : 'MISSING'}`);
    console.log(`API RAW ACTUAL:     ${apiEvent ? apiEvent.rawActual : 'MISSING'}`);
  }

  // Step 4: Query Global Forex Economic Calendar API (/api/market/economic-calendar/global)
  console.log('\n📌 STEP 4: Querying Global Multi-Currency API (/api/market/economic-calendar/global)...');
  const globalRes = await globalEconomicCalendarService.getGlobalEvents({ currencies: 'INR', limit: 20 });

  for (const target of targets) {
    const gEvent = globalRes.events.find(e => (e.eventName === target.name || e.eventName.includes(target.name)) && e.originalDate === target.date);

    console.log('\n---------------------------------------------------------------');
    console.log(`GLOBAL EVENT NAME:  ${target.name} (${target.date})`);
    console.log(`GLOBAL PREVIOUS:    ${gEvent ? gEvent.previous : 'MISSING'}`);
    console.log(`GLOBAL FORECAST:    ${gEvent ? gEvent.forecast : 'MISSING'}`);
    console.log(`GLOBAL ACTUAL:      ${gEvent ? gEvent.actual : 'MISSING'}`);
  }

  console.log('\n===============================================================');
  console.log('✅ REAL DATA PIPELINE VERIFICATION COMPLETE');
  console.log('===============================================================\n');
}

run().catch(console.error);
