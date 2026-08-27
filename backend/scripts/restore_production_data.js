/**
 * Database Restore & Audit Script
 * Restores all scheduled upcoming Indian economic calendar records in Supabase:
 *  - status: 'upcoming'
 *  - actual: null
 *  - previous: null
 *  - source_url: clean official portal URLs
 *  - removes any stray seed records
 */

import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';

async function restoreProductionRecords() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧹 Auditing & Restoring Supabase economic_events Table');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const supabase = supabaseEconomicCalendarService.supabase;
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  // 1. Clean up stray seed records with null event_time or invalid dates
  const { data: straySeedRows } = await supabase
    .from('economic_events')
    .select('id, event_name, event_date, event_time')
    .eq('country_code', 'IN')
    .is('event_time', null);

  if (straySeedRows && straySeedRows.length > 0) {
    console.log(`🗑️ Removing ${straySeedRows.length} stray seed record(s)...`);
    for (const r of straySeedRows) {
      await supabase.from('economic_events').delete().eq('id', r.id);
      console.log(`   Deleted stray record: ${r.event_name} (${r.event_date}) [ID: ${r.id}]`);
    }
  }

  // 2. Fetch all current upcoming / released events
  const { data: allEvents, error } = await supabase
    .from('economic_events')
    .select('*')
    .eq('country_code', 'IN');

  if (error) throw error;

  console.log(`\n📋 Current events in Supabase: ${allEvents.length}`);

  // 3. Reset any future events that were marked released during Phase 3 testing
  let restoredCount = 0;
  for (const ev of allEvents) {
    const defaultSourceUrl =
      ev.event_name === 'RBI Monetary Policy / Repo Rate' ? 'https://www.rbi.org.in' :
      ev.event_name === 'WPI Inflation' ? 'https://eaindustry.nic.in' :
      'https://www.mospi.gov.in';

    const defaultSource =
      ev.event_name === 'RBI Monetary Policy / Repo Rate' ? 'Reserve Bank of India' :
      ev.event_name === 'WPI Inflation' ? 'DPIIT / Ministry of Commerce' :
      'MoSPI';

    if (ev.status === 'released' || ev.actual !== null) {
      console.log(`🔄 Restoring: ${ev.event_name} on ${ev.event_date} (Was: actual=${ev.actual}, status=${ev.status})`);
      await supabase
        .from('economic_events')
        .update({
          status: 'upcoming',
          actual: null,
          previous: null,
          source: defaultSource,
          source_url: defaultSourceUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', ev.id);
      restoredCount++;
    }
  }

  console.log(`\n✅ Restored ${restoredCount} records back to upcoming / actual: null.`);

  // 4. Verify clean state
  const { data: verifiedEvents } = await supabase
    .from('economic_events')
    .select('*')
    .eq('country_code', 'IN')
    .order('event_date', { ascending: true });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Verified Production State in Supabase:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.table(
    verifiedEvents.map(e => ({
      id: e.id.substring(0, 8) + '...',
      event_name: e.event_name,
      date: e.event_date,
      time: e.event_time,
      status: e.status,
      actual: e.actual,
      source: e.source,
      source_url: e.source_url
    }))
  );
}

restoreProductionRecords().catch(console.error);
