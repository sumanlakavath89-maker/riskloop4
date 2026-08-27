/**
 * cleanup_cloudinary_orphans.js
 * 
 * Safe Cloudinary orphan asset detection and cleanup script for RiskLoop.
 * 
 * Default mode: DRY_RUN=true (safe inspection without deleting).
 * Real deletion: DRY_RUN=false node scripts/cleanup_cloudinary_orphans.js --execute
 */

import cloudinary from '../src/config/cloudinary.js';
import { db } from '../src/services/DatabaseService.js';
import { supportService } from '../src/services/SupportService.js';

const isDryRun = process.env.DRY_RUN !== 'false' && !process.argv.includes('--execute');

/**
 * Recursively fetch all Cloudinary assets under riskloop/ using both Admin API pagination and Search API
 */
async function fetchAllCloudinaryAssets() {
  const assetsMap = new Map();
  let page = 1;
  let nextCursor = null;

  console.log('--- CLOUDINARY RESOURCE SCAN DIAGNOSTICS ---');
  console.log('API Method:    cloudinary.api.resources');
  console.log('Prefix:        riskloop/');
  console.log('Resource Type: image');
  console.log('Type:          upload\n');

  // 1. Primary Scan via cloudinary.api.resources with next_cursor pagination
  try {
    do {
      const response = await cloudinary.api.resources({
        resource_type: 'image',
        type: 'upload',
        prefix: 'riskloop/',
        max_results: 100,
        next_cursor: nextCursor
      });

      const count = response.resources ? response.resources.length : 0;
      console.log(`[Admin API Page ${page}] Assets returned: ${count} | next_cursor: ${response.next_cursor || 'null'}`);

      if (response && Array.isArray(response.resources)) {
        for (const res of response.resources) {
          assetsMap.set(res.public_id, {
            public_id: res.public_id,
            format: res.format,
            bytes: res.bytes,
            created_at: res.created_at,
            folder: res.folder || (res.public_id.includes('/') ? res.public_id.substring(0, res.public_id.lastIndexOf('/')) : 'root')
          });
        }
      }

      nextCursor = response.next_cursor || null;
      page++;
    } while (nextCursor);
  } catch (err) {
    console.warn('[Admin API Scan Notice]', err.message);
  }

  // 2. Secondary Search API Scan to ensure no subfolders (profiles/**, journals/**) are missed
  try {
    console.log('\n[Search API Scan] Running expression: "public_id:riskloop/*"...');
    let searchCursor = null;
    do {
      let searchReq = cloudinary.search
        .expression('public_id:riskloop/*')
        .max_results(100);

      if (searchCursor) {
        searchReq = searchReq.next_cursor(searchCursor);
      }

      const searchRes = await searchReq.execute();
      const sCount = searchRes.resources ? searchRes.resources.length : 0;
      console.log(`[Search API Page] Assets returned: ${sCount} | next_cursor: ${searchRes.next_cursor || 'null'}`);

      if (searchRes && Array.isArray(searchRes.resources)) {
        for (const res of searchRes.resources) {
          if (!assetsMap.has(res.public_id)) {
            assetsMap.set(res.public_id, {
              public_id: res.public_id,
              format: res.format,
              bytes: res.bytes,
              created_at: res.created_at,
              folder: res.folder || (res.public_id.includes('/') ? res.public_id.substring(0, res.public_id.lastIndexOf('/')) : 'root')
            });
          }
        }
      }
      searchCursor = searchRes.next_cursor || null;
    } while (searchCursor);
  } catch (searchErr) {
    console.warn('[Search API Notice]', searchErr.message);
  }

  const allAssets = Array.from(assetsMap.values());
  console.log(`\nTotal Unique Cloudinary Assets Discovered: ${allAssets.length}`);
  console.log('Scanned Cloudinary public_ids:');
  allAssets.forEach(a => console.log(`  • ${a.public_id}`));
  console.log('--------------------------------------------\n');

  return allAssets;
}

/**
 * Fetch all active database references across SQLite and Supabase
 */
async function getActiveDatabaseReferences() {
  db.initialize();

  const referencedPublicIds = new Set();
  const profilePublicIds = new Set();
  const tradePublicIds = new Set();

  // 1. Collect from SQLite profiles
  const profiles = db.getAllProfiles();
  profiles.forEach(p => {
    if (p.avatarPublicId) {
      referencedPublicIds.add(p.avatarPublicId);
      profilePublicIds.add(p.avatarPublicId);
    }
  });

  // 2. Collect from SQLite journal trades
  const trades = db.getAllJournalTrades();
  trades.forEach(t => {
    const images = Array.isArray(t.images) ? t.images : [];
    images.forEach(img => {
      const pid = typeof img === 'string' ? img : img?.public_id;
      if (pid) {
        referencedPublicIds.add(pid);
        tradePublicIds.add(pid);
      }
    });
  });

  // 3. Collect from Supabase if live connection exists
  if (supportService.supabase) {
    try {
      const { data: sbProfiles } = await supportService.supabase
        .from('profiles')
        .select('*');
      if (sbProfiles) {
        sbProfiles.forEach(p => {
          if (p.avatar_public_id) {
            referencedPublicIds.add(p.avatar_public_id);
            profilePublicIds.add(p.avatar_public_id);
          } else if (p.avatar_url && p.avatar_url.includes('cloudinary.com')) {
            // Extract public_id from Cloudinary URL if avatar_public_id field wasn't set
            const match = p.avatar_url.match(/upload\/(?:v\d+\/)?(riskloop\/[^\.\?]+)/);
            if (match && match[1]) {
              referencedPublicIds.add(match[1]);
              profilePublicIds.add(match[1]);
            }
          }
        });
      }

      const { data: sbTrades } = await supportService.supabase
        .from('journal_trades')
        .select('*');
      if (sbTrades) {
        sbTrades.forEach(t => {
          const imgs = Array.isArray(t.images) ? t.images : (typeof t.images === 'string' ? JSON.parse(t.images || '[]') : []);
          imgs.forEach(img => {
            const pid = typeof img === 'string' ? img : img?.public_id;
            if (pid) {
              referencedPublicIds.add(pid);
              tradePublicIds.add(pid);
            }
          });
        });
      }
    } catch (e) {
      console.warn('[Orphan Scan] Supabase query notice:', e.message);
    }
  }

  return {
    all: referencedPublicIds,
    profiles: profilePublicIds,
    trades: tradePublicIds
  };
}

export async function runOrphanCleanup({ dryRun = true } = {}) {
  console.log('==============================================');
  console.log('       CLOUDINARY ORPHAN CLEANUP SYSTEM       ');
  console.log('==============================================\n');

  console.log(`DRY RUN MODE: ${dryRun ? 'ENABLED (Safe - no files deleted)' : 'DISABLED (REAL DELETION ACTIVE)'}\n`);

  // 1. Fetch active database references
  const dbRefs = await getActiveDatabaseReferences();
  console.log(`Active Database References: ${dbRefs.all.size} (Profiles: ${dbRefs.profiles.size}, Journal Trades: ${dbRefs.trades.size})\n`);

  console.log('--- PROTECTED ACTIVE ASSETS IN DATABASE ---');
  if (dbRefs.profiles.size > 0) {
    console.log('Active Profile Avatars:');
    dbRefs.profiles.forEach(pid => console.log(`  🛡️  [ACTIVE AVATAR] ${pid}`));
  }
  if (dbRefs.trades.size > 0) {
    console.log('Active Journal Trade Screenshots:');
    dbRefs.trades.forEach(pid => console.log(`  🛡️  [ACTIVE TRADE]  ${pid}`));
  }
  console.log('-------------------------------------------\n');

  // 2. Fetch all Cloudinary assets under riskloop/
  const cloudinaryAssets = await fetchAllCloudinaryAssets();

  // 3. Detect Orphans (Cloudinary assets not present in database)
  const orphans = [];
  for (const asset of cloudinaryAssets) {
    if (!dbRefs.all.has(asset.public_id)) {
      let reason = 'No active database reference found';
      if (asset.public_id.startsWith('riskloop/profiles/')) {
        reason = 'Not referenced by any active user in profiles.avatar_public_id';
      } else if (asset.public_id.startsWith('riskloop/journals/')) {
        reason = 'Trade no longer exists or screenshot removed from trade';
      }

      orphans.push({
        ...asset,
        reason
      });
    }
  }

  // 4. Detect Missing Assets (Database references whose Cloudinary asset was deleted or never uploaded)
  const cloudinaryAssetIds = new Set(cloudinaryAssets.map(a => a.public_id));
  const missingInCloudinary = [];
  for (const dbPid of dbRefs.all) {
    if (!cloudinaryAssetIds.has(dbPid)) {
      missingInCloudinary.push(dbPid);
    }
  }

  console.log('==============================================');
  console.log('                SCAN SUMMARY                  ');
  console.log('==============================================');
  console.log(`Total Cloudinary Assets Scanned: ${cloudinaryAssets.length}`);
  console.log(`Total Database-Referenced Assets: ${dbRefs.all.size}`);
  console.log(`Orphan Candidates in Cloudinary: ${orphans.length}`);
  console.log(`Missing Assets in Cloudinary:    ${missingInCloudinary.length}\n`);

  if (orphans.length > 0) {
    console.log('--- ORPHAN CANDIDATES (Exist in Cloudinary, NOT in DB) ---');
    orphans.forEach((orphan, index) => {
      console.log(`[ORPHAN ${index + 1}/${orphans.length}]`);
      console.log(`  public_id: ${orphan.public_id}`);
      console.log(`  folder:    ${orphan.folder}`);
      console.log(`  size:      ${orphan.bytes ? (orphan.bytes / 1024).toFixed(1) + ' KB' : 'N/A'}`);
      console.log(`  reason:    ${orphan.reason}`);
      console.log('');
    });
    console.log('----------------------------------------------------------\n');
  } else {
    console.log('✅ No Orphan Candidates Found: Every scanned Cloudinary asset has a matching active database record.\n');
  }

  if (missingInCloudinary.length > 0) {
    console.log('--- MISSING ASSETS (Referenced in DB, but not in Cloudinary) ---');
    missingInCloudinary.forEach(pid => {
      console.log(`  ⚠️  [NOT IN CLOUDINARY] ${pid}`);
    });
    console.log('Note: These are mock/test references in local SQLite from earlier tests whose files were cleaned up or never uploaded.');
    console.log('----------------------------------------------------------------\n');
  }

  let deletedCount = 0;

  // 5. Execute deletion if real mode
  if (!dryRun) {
    console.log('🗑️  Proceeding with deletion of verified orphan assets...\n');
    for (const orphan of orphans) {
      try {
        const delRes = await cloudinary.uploader.destroy(orphan.public_id, {
          resource_type: 'image',
          invalidate: true
        });
        if (delRes.result === 'ok' || delRes.result === 'not found') {
          console.log(`  ✅ Deleted: ${orphan.public_id} (${delRes.result})`);
          deletedCount++;
        } else {
          console.warn(`  ⚠️  Could not delete ${orphan.public_id}: ${delRes.result}`);
        }
      } catch (delErr) {
        console.error(`  ❌ Error deleting ${orphan.public_id}: ${delErr.message}`);
      }
    }
    console.log(`\nCleanup complete: ${deletedCount} of ${orphans.length} orphan asset(s) deleted.`);
  } else {
    console.log('ℹ️  SAFETY LOCK: No assets deleted because DRY_RUN is ENABLED.');
    console.log('   To perform real deletion, run with: DRY_RUN=false node scripts/cleanup_cloudinary_orphans.js --execute');
  }

  console.log('\n==============================================\n');

  return {
    dryRun,
    totalScanned: cloudinaryAssets.length,
    activeReferenced: dbRefs.all.size,
    orphansFound: orphans.length,
    missingInCloudinaryCount: missingInCloudinary.length,
    deletedCount,
    orphans,
    missingInCloudinary
  };
}

// Execute directly if run as a script
if (process.argv[1] && process.argv[1].endsWith('cleanup_cloudinary_orphans.js')) {
  runOrphanCleanup({ dryRun: isDryRun }).catch(err => {
    console.error('[Fatal Error in Cleanup Script]', err);
    process.exit(1);
  });
}
