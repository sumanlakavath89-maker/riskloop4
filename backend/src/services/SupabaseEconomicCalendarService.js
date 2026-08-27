import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { indiaCalendarScheduleService } from './IndiaCalendarScheduleService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

class SupabaseEconomicCalendarService {
    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey =
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            this.supabase = null;
            console.error(
                'SupabaseEconomicCalendarService: Supabase is not configured'
            );
            return;
        }

        this.supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });

        console.log(
            '✅ SupabaseEconomicCalendarService: Supabase connected'
        );
    }

    async getEvents(filters = {}) {
        if (!this.supabase) {
            throw new Error('Supabase is not configured');
        }

        let query = this.supabase
            .from('economic_events')
            .select('*')
            .order('event_date', { ascending: true })
            .order('event_time', { ascending: true });

        if (filters.countryCode) {
            query = query.eq(
                'country_code',
                filters.countryCode.toUpperCase()
            );
        }

        if (filters.impact) {
            query = query.eq(
                'impact',
                filters.impact.toLowerCase()
            );
        }

        if (filters.from) {
            query = query.gte('event_date', filters.from);
        }

        if (filters.to) {
            query = query.lte('event_date', filters.to);
        }

        if (filters.limit) {
            query = query.limit(Number(filters.limit));
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        return data || [];
    }

    /**
     * Check for duplicate rows in public.economic_events
     * Returns list of duplicate keys if any exist
     */
    async checkForDuplicateEvents() {
        if (!this.supabase) {
            throw new Error('Supabase is not configured');
        }

        const data = await this.getEvents({});

        const seen = new Map();
        const duplicates = [];

        for (const row of data || []) {
            const key = `${(row.country_code || 'IN').toUpperCase()}|${(row.event_name || '').toLowerCase().trim()}|${String(row.event_date).split('T')[0]}`;
            if (seen.has(key)) {
                duplicates.push({
                    key,
                    originalId: seen.get(key).id,
                    duplicateId: row.id,
                    event_name: row.event_name,
                    event_date: row.event_date
                });
            } else {
                seen.set(key, row);
            }
        }

        return {
            hasDuplicates: duplicates.length > 0,
            duplicateCount: duplicates.length,
            duplicates,
            totalRows: (data || []).length
        };
    }

    /**
     * Sync upcoming Indian economic events into Supabase safely
     * Uses deduplication & upsert to ensure idempotency while preserving existing data:
     *  - Never overwrites actual values with null
     *  - Never resets 'released' status back to 'upcoming'
     *  - Preserves existing source_url, previous, forecast if incoming is empty
     * 
     * @param {number} [daysAhead=90]
     * @param {Object} [options]
     * @returns {Object} Summary of sync operation
     */
    async syncUpcomingIndiaEvents(daysAhead = 90, options = {}) {
        if (!this.supabase) {
            throw new Error('Supabase is not configured');
        }

        // 1. Generate scheduled upcoming events from IndiaCalendarScheduleService
        const generated = indiaCalendarScheduleService.generateUpcomingEvents({
            daysAhead: parseInt(daysAhead, 10),
            from: options.from,
            to: options.to
        });

        const generatedEvents = generated.events || [];
        const dateRange = generated.dateRange;

        // 2. Fetch existing records from Supabase in the date range to compare
        const { data: existingRows, error: fetchErr } = await this.supabase
            .from('economic_events')
            .select('*')
            .gte('event_date', dateRange.from)
            .lte('event_date', dateRange.to);

        if (fetchErr) {
            throw fetchErr;
        }

        // Map existing rows by unique composite key: COUNTRY_CODE|EVENT_NAME|EVENT_DATE
        const existingMap = new Map();
        for (const row of existingRows || []) {
            const key = `${(row.country_code || 'IN').toUpperCase()}|${(row.event_name || '').toLowerCase().trim()}|${String(row.event_date).split('T')[0]}`;
            existingMap.set(key, row);
        }

        let insertedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        const errors = [];
        const processedEvents = [];

        // 3. Process each generated event with safety and preservation rules
        for (const gen of generatedEvents) {
            const key = `${gen.country_code.toUpperCase()}|${gen.event_name.toLowerCase().trim()}|${gen.event_date}`;
            const existing = existingMap.get(key);

            const recordToSave = {
                event_name: gen.event_name,
                country: gen.country,
                country_code: gen.country_code,
                event_date: gen.event_date,
                event_time: gen.event_time,
                timezone: gen.timezone || 'Asia/Kolkata',
                impact: gen.impact || 'medium',
                previous: gen.previous,
                forecast: gen.forecast,
                actual: null,
                unit: gen.unit || '%',
                source: gen.source,
                source_url: gen.source_url,
                status: gen.status || 'upcoming',
                description: gen.description,
                updated_at: new Date().toISOString()
            };

            if (existing) {
                // ── Preservation Rules ──
                // 1. Preserve existing 'actual' value if already present
                if (existing.actual !== null && existing.actual !== undefined && existing.actual !== '') {
                    recordToSave.actual = existing.actual;
                }

                // 2. Preserve 'released' status (never reset back to 'upcoming')
                if (existing.status === 'released') {
                    recordToSave.status = 'released';
                }

                // 3. Preserve source_url if existing has a valid one
                if (existing.source_url && !recordToSave.source_url) {
                    recordToSave.source_url = existing.source_url;
                }

                // 4. Preserve previous or forecast if already populated
                if (existing.previous && !recordToSave.previous) {
                    recordToSave.previous = existing.previous;
                }
                if (existing.forecast && !recordToSave.forecast) {
                    recordToSave.forecast = existing.forecast;
                }

                // Check if anything meaningful changed
                const isIdentical =
                    existing.event_time === recordToSave.event_time &&
                    existing.impact === recordToSave.impact &&
                    existing.previous === recordToSave.previous &&
                    existing.forecast === recordToSave.forecast &&
                    existing.actual === recordToSave.actual &&
                    existing.status === recordToSave.status &&
                    existing.description === recordToSave.description;

                if (isIdentical) {
                    skippedCount++;
                    processedEvents.push({ ...existing, _syncAction: 'skipped' });
                    continue;
                }

                // Update existing row using its primary key (id)
                recordToSave.id = existing.id;
                const { data: updatedData, error: updateErr } = await this.supabase
                    .from('economic_events')
                    .update(recordToSave)
                    .eq('id', existing.id)
                    .select();

                if (updateErr) {
                    errors.push({ event: gen.event_name, date: gen.event_date, error: updateErr.message });
                } else {
                    updatedCount++;
                    processedEvents.push({ ...(updatedData?.[0] || recordToSave), _syncAction: 'updated' });
                }
            } else {
                // Insert brand new row
                const { data: insertedData, error: insertErr } = await this.supabase
                    .from('economic_events')
                    .insert([recordToSave])
                    .select();

                if (insertErr) {
                    errors.push({ event: gen.event_name, date: gen.event_date, error: insertErr.message });
                } else {
                    insertedCount++;
                    processedEvents.push({ ...(insertedData?.[0] || recordToSave), _syncAction: 'inserted' });
                    // Update map to avoid duplicate in the same batch
                    existingMap.set(key, insertedData?.[0] || recordToSave);
                }
            }
        }

        return {
            success: errors.length === 0,
            message: `India economic calendar sync completed: ${insertedCount} inserted, ${updatedCount} updated, ${skippedCount} skipped.`,
            summary: {
                totalGenerated: generatedEvents.length,
                inserted: insertedCount,
                updated: updatedCount,
                skipped: skippedCount,
                errors: errors.length
            },
            dateRange,
            errorDetails: errors.length > 0 ? errors : null,
            events: processedEvents
        };
    }
}

export const supabaseEconomicCalendarService =
    new SupabaseEconomicCalendarService();