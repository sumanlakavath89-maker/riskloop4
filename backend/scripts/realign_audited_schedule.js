/**
 * Database Realignment Script
 * Removes old misaligned IIP placeholder rows and re-syncs all 5 official macroeconomic indicators
 * using the audited MoSPI ARC schedules.
 */

import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';

async function realignDatabase() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Realigning Supabase Calendar with Audited MoSPI ARC Dates');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const supabase = supabaseEconomicCalendarService.supabase;
  if (!supabase) throw new Error('Supabase not configured');

  // 1. Delete old IIP rows that were scheduled on the 12th/14th
  const { data: oldIipRows } = await supabase
    .from('economic_events')
    .select('id, event_name, event_date')
    .eq('country_code', 'IN')
    .eq('event_name', 'IIP');

  if (oldIipRows && oldIipRows.length > 0) {
    console.log(`🗑️ Removing ${oldIipRows.length} old IIP records...`);
    for (const r of oldIipRows) {
      await supabase.from('economic_events').delete().eq('id', r.id);
      console.log(`   Deleted: IIP on ${r.event_date}`);
    }
  }

  // 2. Perform syncUpcomingIndiaEvents for next 90 days
  console.log('\n📥 Synchronizing 90-Day Audited Official Indian Schedule...');
  const syncResult = await supabaseEconomicCalendarService.syncUpcomingIndiaEvents(90);
  console.log('Sync Result:', JSON.stringify(syncResult.summary, null, 2));

  // 3. Verify final state in Supabase
  const allEvents = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  console.log(`\n📊 Total Verified Events in Supabase: ${allEvents.length}\n`);

  console.table(
    allEvents.map(e => ({
      event_name: e.event_name,
      date: e.event_date,
      time: e.event_time,
      impact: e.impact,
      status: e.status,
      source: e.source
    }))
  );
}

realignDatabase().catch(console.error);
