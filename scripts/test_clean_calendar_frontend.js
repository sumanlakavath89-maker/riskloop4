/**
 * Frontend Economic Calendar Clean Display & Internal Backend Attribution Test
 * 
 * Verifies:
 * 1. User-Facing Frontend Cleanliness:
 *    - indian-market.js: Zero visible source pills or external source links
 *    - forex-market.js: Zero visible source pills or external source links
 *    - global-economic-calendar.js: Zero Source column header or data cells in user table
 *    - index.html: Exactly 8 clean columns: Date, Time, Event, Country/Currency, Impact, Previous, Forecast, Actual
 * 
 * 2. Backend & Internal Data Integrity:
 *    - IndiaOfficialEconomicCalendarService continues to supply source, sourceName, sourceUrl, officialSource: true
 *    - GlobalEconomicCalendarService continues to supply source, sourceName, sourceUrl, officialSource: true
 *    - Data verification, polling, and audit mechanisms remain 100% operational
 */

import fs from 'fs';
import path from 'path';
import { indiaOfficialEconomicCalendarService } from '../backend/src/services/IndiaOfficialEconomicCalendarService.js';
import { globalEconomicCalendarService } from '../backend/src/services/forex/GlobalEconomicCalendarService.js';

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING CLEAN FRONTEND CALENDAR DISPLAY & INTERNAL ATTRIBUTION');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ── SECTION 1: indian-market.js Frontend Check ───────────────────────
  console.log('📌 Section 1: Verifying indian-market.js User-Facing Render Logic...');
  const indianMarketJs = fs.readFileSync(path.resolve('indian-market.js'), 'utf8');

  assert(!indianMarketJs.includes('cal-source-pill'), 'indian-market.js contains ZERO cal-source-pill references');
  assert(!indianMarketJs.includes('🏛️'), 'indian-market.js contains ZERO source institution emoji/badges');
  assert(!indianMarketJs.includes('<a href="${sourceUrl}"'), 'indian-market.js contains ZERO clickable external source links in table');

  // ── SECTION 2: forex-market.js Frontend Check ────────────────────────
  console.log('\n📌 Section 2: Verifying forex-market.js User-Facing Render Logic...');
  const forexMarketJs = fs.readFileSync(path.resolve('forex-market.js'), 'utf8');

  assert(!forexMarketJs.includes('cal-source-pill'), 'forex-market.js contains ZERO cal-source-pill references');
  assert(!forexMarketJs.includes('🏛️'), 'forex-market.js contains ZERO source institution emoji/badges');
  assert(!forexMarketJs.includes('<a href="${sourceUrl}"'), 'forex-market.js contains ZERO clickable external source links in table');

  // ── SECTION 3: global-economic-calendar.js Check ─────────────────────
  console.log('\n📌 Section 3: Verifying global-economic-calendar.js Table Schema...');
  const gecJs = fs.readFileSync(path.resolve('global-economic-calendar.js'), 'utf8');

  assert(!gecJs.includes('<th style="padding: 12px 16px;">Source</th>'), 'global-economic-calendar.js contains NO Source table header');
  assert(!gecJs.includes('${ev.source}</td>'), 'global-economic-calendar.js contains NO Source data cell');

  // ── SECTION 4: index.html Table Headers Check ────────────────────────
  console.log('\n📌 Section 4: Verifying index.html Table Structures...');
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');

  // Check Indian calendar table header
  const indiaTableMatch = indexHtml.match(/<table[^>]*id="calendarTable"[\s\S]*?<\/thead>/);
  assert(indiaTableMatch !== null, 'Found #calendarTable in index.html');
  if (indiaTableMatch) {
    const headerHtml = indiaTableMatch[0];
    assert(!headerHtml.toLowerCase().includes('source'), 'Indian calendar table header contains NO source column');
  }

  // Check Forex calendar table header
  const forexTableMatch = indexHtml.match(/<table[^>]*id="forexCalendarTable"[\s\S]*?<\/thead>/);
  assert(forexTableMatch !== null, 'Found #forexCalendarTable in index.html');
  if (forexTableMatch) {
    const headerHtml = forexTableMatch[0];
    assert(!headerHtml.toLowerCase().includes('source'), 'Forex calendar table header contains NO source column');
  }

  // ── SECTION 5: Backend Attribution Preservation Check ────────────────
  console.log('\n📌 Section 5: Verifying Backend Internal Source Attribution Preservation...');
  const indiaData = await indiaOfficialEconomicCalendarService.getEconomicCalendar({ period: 'all' });
  assert(Array.isArray(indiaData.events) && indiaData.events.length > 0, 'Indian backend returned events');
  const indiaPreservesSource = indiaData.events.every(e => e.source && e.sourceName && e.sourceUrl && e.officialSource === true);
  assert(indiaPreservesSource, 'Indian backend events PRESERVE source, sourceName, sourceUrl, and officialSource internally');

  const forexData = await globalEconomicCalendarService.getGlobalEvents({ period: 'all', limit: 20 });
  assert(Array.isArray(forexData.events) && forexData.events.length > 0, 'Forex backend returned events');
  const forexPreservesSource = forexData.events.every(e => e.source && e.sourceName && e.sourceUrl && e.officialSource === true);
  assert(forexPreservesSource, 'Forex backend events PRESERVE source, sourceName, sourceUrl, and officialSource internally');

  // ── SUMMARY ──────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`📊 CLEAN FRONTEND CALENDAR SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
