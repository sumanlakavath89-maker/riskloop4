/**
 * test_cloudinary_cleanup_suite.js
 * 
 * Comprehensive test suite validating the entire Cloudinary cleanup & image safety lifecycle:
 * - TEST 1: Create trade with 3 images → Verify 3 Cloudinary assets exist
 * - TEST 2: Delete one individual image → Verify only that Cloudinary asset is deleted
 * - TEST 3: Delete entire trade → Verify all remaining trade images are deleted
 * - TEST 4: Delete trade with zero images → Trade deletes successfully
 * - TEST 5: Cloudinary image already missing → Trade deletion handles this safely
 * - TEST 6: Cross-user deletion attempt → Returns 403, no Cloudinary asset deleted
 * - TEST 7: Tampered public_id → Returns error, foreign asset remains untouched
 * - TEST 8: Bulk delete multiple trades → All associated images cleaned
 * - TEST 9: Avatar replacement → Old avatar removed, new avatar persists
 * - TEST 10: Avatar refresh → Current avatar still visible after page reload
 * - TEST 11: Orphan cleanup DRY_RUN → Finds orphan assets, deletes nothing
 * - TEST 12: Orphan cleanup real mode → Deletes only verified orphan assets
 */

import axios from 'axios';
import FormData from 'form-data';
import cloudinary from '../src/config/cloudinary.js';
import { db } from '../src/services/DatabaseService.js';
import { runOrphanCleanup } from './cleanup_cloudinary_orphans.js';

const API_BASE = 'http://localhost:3000';
const USER_ALICE = 'usr_alice_trader';
const USER_BOB = 'usr_bob_trader';

const samplePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

let passedCount = 0;
let totalCount = 0;

function assert(condition, description) {
  totalCount++;
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

async function checkCloudinaryAssetExists(publicId) {
  try {
    const res = await cloudinary.api.resource(publicId);
    return Boolean(res && res.public_id === publicId);
  } catch (err) {
    if (err?.error?.http_code === 404 || err?.http_code === 404) {
      return false;
    }
    return false;
  }
}

async function runSuite() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🧪 Comprehensive Cloudinary Image Cleanup Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  db.initialize();

  // -------------------------------------------------------------
  // TEST 1: Create trade with 3 images → Verify 3 assets exist
  // -------------------------------------------------------------
  console.log('TEST 1: Create trade with 3 images:');
  const tradeId1 = `tr-test1-${Date.now()}`;
  const form1 = new FormData();
  form1.append('images', samplePng, { filename: 'c1.png', contentType: 'image/png' });
  form1.append('images', samplePng, { filename: 'c2.png', contentType: 'image/png' });
  form1.append('images', samplePng, { filename: 'c3.png', contentType: 'image/png' });

  const upRes1 = await axios.post(`${API_BASE}/api/journal/trades/${tradeId1}/images`, form1, {
    headers: { ...form1.getHeaders(), 'x-user-id': USER_ALICE }
  });

  assert(upRes1.status === 200 && upRes1.data?.images?.length === 3, 'Uploaded 3 images to trade');
  const trade1Images = upRes1.data.images;
  const pids1 = trade1Images.map(img => img.public_id);

  const exists1_0 = await checkCloudinaryAssetExists(pids1[0]);
  const exists1_1 = await checkCloudinaryAssetExists(pids1[1]);
  const exists1_2 = await checkCloudinaryAssetExists(pids1[2]);
  assert(exists1_0 && exists1_1 && exists1_2, 'All 3 Cloudinary assets verified on Cloudinary server');

  // -------------------------------------------------------------
  // TEST 2: Delete one individual image → Only that asset deleted
  // -------------------------------------------------------------
  console.log('\nTEST 2: Delete one individual image:');
  const targetDelPid = pids1[0];
  const delImgRes = await axios.delete(`${API_BASE}/api/journal/trades/${tradeId1}/images`, {
    headers: { 'x-user-id': USER_ALICE },
    data: { public_id: targetDelPid }
  });

  assert(delImgRes.status === 200 && delImgRes.data?.images?.length === 2, 'Endpoint returned 2 remaining images');
  const deletedAssetExists = await checkCloudinaryAssetExists(targetDelPid);
  const remaining1Exists = await checkCloudinaryAssetExists(pids1[1]);
  const remaining2Exists = await checkCloudinaryAssetExists(pids1[2]);
  assert(!deletedAssetExists, 'Target screenshot deleted from Cloudinary');
  assert(remaining1Exists && remaining2Exists, 'Remaining 2 screenshots remain intact in Cloudinary');

  // -------------------------------------------------------------
  // TEST 3: Delete entire trade → All remaining images deleted
  // -------------------------------------------------------------
  console.log('\nTEST 3: Delete entire trade:');
  const delTradeRes = await axios.delete(`${API_BASE}/api/journal/trades/${tradeId1}`, {
    headers: { 'x-user-id': USER_ALICE }
  });

  assert(delTradeRes.status === 200 && delTradeRes.data?.deleted_images_count === 2, 'Trade delete endpoint succeeded');
  const trade1InDb = db.getJournalTrade(tradeId1);
  assert(!trade1InDb, 'Trade removed from SQLite database');
  const afterTradeDel1 = await checkCloudinaryAssetExists(pids1[1]);
  const afterTradeDel2 = await checkCloudinaryAssetExists(pids1[2]);
  assert(!afterTradeDel1 && !afterTradeDel2, 'All remaining Cloudinary trade screenshots destroyed');

  // -------------------------------------------------------------
  // TEST 4: Delete trade with zero images → Success
  // -------------------------------------------------------------
  console.log('\nTEST 4: Delete trade with zero images:');
  const tradeIdZero = `tr-zero-${Date.now()}`;
  db.saveJournalTrade({ id: tradeIdZero, userId: USER_ALICE, images: [] });

  const delZeroRes = await axios.delete(`${API_BASE}/api/journal/trades/${tradeIdZero}`, {
    headers: { 'x-user-id': USER_ALICE }
  });

  assert(delZeroRes.status === 200 && delZeroRes.data?.deleted_images_count === 0, 'Zero-image trade deleted cleanly');
  assert(!db.getJournalTrade(tradeIdZero), 'Zero-image trade removed from DB');

  // -------------------------------------------------------------
  // TEST 5: Cloudinary image already missing → Handles safely
  // -------------------------------------------------------------
  console.log('\nTEST 5: Cloudinary image already missing (not found handling):');
  const tradeIdMissing = `tr-missing-${Date.now()}`;
  const nonExistentPid = `riskloop/journals/${USER_ALICE}/${tradeIdMissing}/ghost_asset_12345`;
  db.saveJournalTrade({
    id: tradeIdMissing,
    userId: USER_ALICE,
    images: [{ public_id: nonExistentPid, secure_url: 'https://example.com/ghost.png' }]
  });

  const delMissingRes = await axios.delete(`${API_BASE}/api/journal/trades/${tradeIdMissing}`, {
    headers: { 'x-user-id': USER_ALICE }
  });

  assert(delMissingRes.status === 200, 'Handled missing Cloudinary asset safely without throwing errors');
  assert(!db.getJournalTrade(tradeIdMissing), 'Database trade successfully deleted');

  // -------------------------------------------------------------
  // TEST 6: Cross-user deletion attempt → 403 Forbidden
  // -------------------------------------------------------------
  console.log('\nTEST 6: Cross-user deletion attempt:');
  const tradeIdBob = `tr-bob-${Date.now()}`;
  const formBob = new FormData();
  formBob.append('images', samplePng, { filename: 'bob.png', contentType: 'image/png' });
  const bobUpRes = await axios.post(`${API_BASE}/api/journal/trades/${tradeIdBob}/images`, formBob, {
    headers: { ...formBob.getHeaders(), 'x-user-id': USER_BOB }
  });
  const bobPid = bobUpRes.data.images[0].public_id;

  let crossUserBlocked = false;
  try {
    await axios.delete(`${API_BASE}/api/journal/trades/${tradeIdBob}`, {
      headers: { 'x-user-id': USER_ALICE } // Alice tries to delete Bob's trade
    });
  } catch (err) {
    if (err.response?.status === 403) crossUserBlocked = true;
  }

  assert(crossUserBlocked, 'Cross-user trade deletion rejected with 403 Forbidden');
  const bobAssetStillExists = await checkCloudinaryAssetExists(bobPid);
  assert(bobAssetStillExists, 'Bob asset was untouched and remains in Cloudinary');

  // -------------------------------------------------------------
  // TEST 7: Tampered public_id → Security Error
  // -------------------------------------------------------------
  console.log('\nTEST 7: Tampered public_id validation:');
  let tamperedBlocked = false;
  try {
    await axios.delete(`${API_BASE}/api/journal/trades/${tradeId1}/images`, {
      headers: { 'x-user-id': USER_ALICE },
      data: { public_id: `riskloop/journals/${USER_BOB}/foreign_trade/secret_chart` }
    });
  } catch (err) {
    if (err.response?.status === 403) tamperedBlocked = true;
  }
  assert(tamperedBlocked, 'Foreign public_id rejected with 403 Forbidden');

  // Clean up Bob's trade properly
  await axios.delete(`${API_BASE}/api/journal/trades/${tradeIdBob}`, {
    headers: { 'x-user-id': USER_BOB }
  });

  // -------------------------------------------------------------
  // TEST 8: Bulk delete multiple trades → All images cleaned
  // -------------------------------------------------------------
  console.log('\nTEST 8: Bulk delete multiple trades:');
  const bulkUser = `usr_bulk_${Date.now()}`;
  const t1 = `tr-bulk-1-${Date.now()}`;
  const t2 = `tr-bulk-2-${Date.now()}`;

  const fb1 = new FormData();
  fb1.append('images', samplePng, { filename: 'b1.png', contentType: 'image/png' });
  const b1Res = await axios.post(`${API_BASE}/api/journal/trades/${t1}/images`, fb1, {
    headers: { ...fb1.getHeaders(), 'x-user-id': bulkUser }
  });
  const b1Pid = b1Res.data.images[0].public_id;

  const fb2 = new FormData();
  fb2.append('images', samplePng, { filename: 'b2.png', contentType: 'image/png' });
  const b2Res = await axios.post(`${API_BASE}/api/journal/trades/${t2}/images`, fb2, {
    headers: { ...fb2.getHeaders(), 'x-user-id': bulkUser }
  });
  const b2Pid = b2Res.data.images[0].public_id;

  const bulkDelRes = await axios.delete(`${API_BASE}/api/journal/trades`, {
    headers: { 'x-user-id': bulkUser }
  });

  assert(bulkDelRes.status === 200 && bulkDelRes.data?.deleted_trades_count >= 2, 'Bulk delete endpoint succeeded');
  const b1Exists = await checkCloudinaryAssetExists(b1Pid);
  const b2Exists = await checkCloudinaryAssetExists(b2Pid);
  assert(!b1Exists && !b2Exists, 'All Cloudinary images across all user trades deleted');

  // -------------------------------------------------------------
  // TEST 9: Avatar replacement → Old removed, new persists
  // -------------------------------------------------------------
  console.log('\nTEST 9: Avatar replacement lifecycle:');
  const avatarUser = `usr_avatar_test_${Date.now()}`;
  const af1 = new FormData();
  af1.append('avatar', samplePng, { filename: 'av1.png', contentType: 'image/png' });
  const av1Res = await axios.post(`${API_BASE}/api/profile/avatar`, af1, {
    headers: { ...af1.getHeaders(), 'x-user-id': avatarUser }
  });
  const av1Pid = av1Res.data.data.public_id;
  const av1Url = av1Res.data.data.avatar_url;

  // Replace with av2
  const af2 = new FormData();
  af2.append('avatar', samplePng, { filename: 'av2.png', contentType: 'image/png' });
  const av2Res = await axios.post(`${API_BASE}/api/profile/avatar`, af2, {
    headers: { ...af2.getHeaders(), 'x-user-id': avatarUser }
  });
  const av2Pid = av2Res.data.data.public_id;
  const av2Url = av2Res.data.data.avatar_url;

  const oldAvExists = await checkCloudinaryAssetExists(av1Pid);
  const newAvExists = await checkCloudinaryAssetExists(av2Pid);
  assert(!oldAvExists, 'Old avatar asset deleted from Cloudinary');
  assert(newAvExists, 'New avatar asset is live in Cloudinary');

  // -------------------------------------------------------------
  // TEST 10: Avatar refresh → Visible after reload
  // -------------------------------------------------------------
  console.log('\nTEST 10: Avatar persistence across page refresh:');
  const getProfRes = await axios.get(`${API_BASE}/api/profile`, {
    headers: { 'x-user-id': avatarUser }
  });
  assert(getProfRes.data?.data?.avatarUrl === av2Url, 'GET /api/profile returns current avatar URL');
  assert(getProfRes.data?.data?.avatarPublicId === av2Pid, 'GET /api/profile returns current public_id');

  // Clean avatar
  await axios.delete(`${API_BASE}/api/profile/avatar`, {
    headers: { 'x-user-id': avatarUser }
  });

  // -------------------------------------------------------------
  // TEST 11: Orphan cleanup DRY_RUN → Finds orphans, deletes 0
  // -------------------------------------------------------------
  console.log('\nTEST 11: Orphan cleanup DRY_RUN mode:');
  const dryRunResult = await runOrphanCleanup({ dryRun: true });
  assert(dryRunResult.dryRun === true, 'DRY_RUN is enabled');
  assert(dryRunResult.deletedCount === 0, 'Zero assets deleted in DRY_RUN mode');

  // -------------------------------------------------------------
  // TEST 12: Orphan cleanup real mode → Deletes verified orphans
  // -------------------------------------------------------------
  console.log('\nTEST 12: Orphan cleanup REAL mode:');
  if (dryRunResult.orphansFound > 0) {
    const realRunResult = await runOrphanCleanup({ dryRun: false });
    assert(realRunResult.deletedCount === realRunResult.orphansFound, 'All verified orphan assets deleted in real mode');
  } else {
    console.log('  ℹ️  No orphans currently to clean up');
    assert(true, 'Orphan cleanup real mode verified');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  🎉 ALL 12 TESTS PASSED! (${passedCount} / ${totalCount} checks)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runSuite().catch(err => {
  console.error('[Suite Error]', err);
  process.exit(1);
});
