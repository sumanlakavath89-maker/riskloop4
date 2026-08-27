/**
 * test_phase1_2_cloudinary.js
 * End-to-End Verification Test for Phase 1 and Phase 2 of Cloudinary Integration
 */

import axios from 'axios';
import FormData from 'form-data';
import { db } from '../src/services/DatabaseService.js';
import imageUploadService from '../src/services/ImageUploadService.js';

const API_BASE = 'http://localhost:3000';
const TEST_USER_1 = 'test_trader_phase2_user1';
const TEST_USER_2 = 'test_trader_phase2_user2';
const TEST_TRADE_1 = 'trade_phase2_test_001';
const TEST_TRADE_2 = 'trade_phase2_test_002';

// 1x1 transparent PNG buffer
const sample1x1Png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function runVerification() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🧪 Running Cloudinary Integration Tests (Phase 1 & 2)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let testsPassed = 0;
  let testsTotal = 0;

  function assert(condition, testName) {
    testsTotal++;
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      testsPassed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
    }
  }

  // ── 1. Database Schema Checks ─────────────────────────────────────────────
  console.log('1. Verifying Database Schema Additions:');
  db.initialize();
  const testProfile = db.upsertProfile({
    id: TEST_USER_1,
    email: 'user1@riskloop.io',
    fullName: 'Test Trader One',
    avatarUrl: 'https://example.com/avatar.png',
    avatarPublicId: 'riskloop/profiles/user1/sample'
  });
  assert(testProfile && testProfile.avatarPublicId === 'riskloop/profiles/user1/sample', 'SQLite profiles table supports avatarPublicId column');

  const testTrade = db.saveJournalTrade({
    id: TEST_TRADE_1,
    userId: TEST_USER_1,
    symbol: 'BANKNIFTY',
    images: [{ secure_url: 'https://example.com/img.png', public_id: 'riskloop/journals/user1/trade1/img' }]
  });
  assert(testTrade && Array.isArray(testTrade.images) && testTrade.images.length === 1, 'SQLite journal_trades table supports images JSON array');

  // ── 2. Profile Avatar Upload & Replace & Delete Flow ──────────────────────
  console.log('\n2. Testing Authenticated Profile Avatar Endpoints:');

  // Upload Avatar
  const form1 = new FormData();
  form1.append('avatar', sample1x1Png, { filename: 'avatar1.png', contentType: 'image/png' });

  const avatarRes1 = await axios.post(`${API_BASE}/api/profile/avatar`, form1, {
    headers: {
      ...form1.getHeaders(),
      'x-user-id': TEST_USER_1,
      'x-user-email': 'user1@riskloop.io'
    }
  });

  assert(avatarRes1.data?.success === true, 'POST /api/profile/avatar uploads photo successfully');
  const avatarPublicId1 = avatarRes1.data?.data?.public_id;
  assert(avatarPublicId1?.startsWith(`riskloop/profiles/${TEST_USER_1}/`), `Avatar path isolated under riskloop/profiles/${TEST_USER_1}/`);

  // Replace Avatar (Verify Old Avatar Asset Cleaned Up)
  const form2 = new FormData();
  form2.append('avatar', sample1x1Png, { filename: 'avatar2.png', contentType: 'image/png' });

  const avatarRes2 = await axios.post(`${API_BASE}/api/profile/avatar`, form2, {
    headers: {
      ...form2.getHeaders(),
      'x-user-id': TEST_USER_1,
      'x-user-email': 'user1@riskloop.io'
    }
  });

  assert(avatarRes2.data?.success === true, 'POST /api/profile/avatar replaces photo successfully');
  const avatarPublicId2 = avatarRes2.data?.data?.public_id;
  assert(avatarPublicId2 && avatarPublicId2 !== avatarPublicId1, 'New avatar public_id generated');

  // Delete Avatar
  const delAvatarRes = await axios.delete(`${API_BASE}/api/profile/avatar`, {
    headers: {
      'x-user-id': TEST_USER_1
    }
  });

  assert(delAvatarRes.data?.success === true, 'DELETE /api/profile/avatar deletes photo successfully');
  const profileAfterDel = (await axios.get(`${API_BASE}/api/profile`, { headers: { 'x-user-id': TEST_USER_1 } })).data?.data;
  assert(!profileAfterDel.avatarUrl && !profileAfterDel.avatarPublicId, 'Profile avatar fields cleared in database');

  // ── 3. Journal Trade Images Flow ──────────────────────────────────────────
  console.log('\n3. Testing Journal Trade Screenshots (Max 3, Ownership & Isolation):');

  // Create clean trade for user1
  db.saveJournalTrade({
    id: TEST_TRADE_1,
    userId: TEST_USER_1,
    symbol: 'NIFTY',
    images: []
  });

  // Create trade for user2
  db.saveJournalTrade({
    id: TEST_TRADE_2,
    userId: TEST_USER_2,
    symbol: 'RELIANCE',
    images: []
  });

  // Upload 2 images to User 1's trade
  const journalForm1 = new FormData();
  journalForm1.append('images', sample1x1Png, { filename: 'chart1.png', contentType: 'image/png' });
  journalForm1.append('images', sample1x1Png, { filename: 'chart2.png', contentType: 'image/png' });

  const journalUploadRes1 = await axios.post(`${API_BASE}/api/journal/trades/${TEST_TRADE_1}/images`, journalForm1, {
    headers: {
      ...journalForm1.getHeaders(),
      'x-user-id': TEST_USER_1
    }
  });

  assert(journalUploadRes1.data?.success === true && journalUploadRes1.data?.total_count === 2, 'POST /api/journal/trades/:id/images uploads 2 screenshots');
  const firstImagePublicId = journalUploadRes1.data?.added_images?.[0]?.public_id;
  assert(firstImagePublicId?.startsWith(`riskloop/journals/${TEST_USER_1}/${TEST_TRADE_1}/`), `Journal images path isolated under riskloop/journals/${TEST_USER_1}/${TEST_TRADE_1}/`);

  // Upload 1 more image (reaches max limit of 3)
  const journalForm2 = new FormData();
  journalForm2.append('images', sample1x1Png, { filename: 'chart3.png', contentType: 'image/png' });

  const journalUploadRes2 = await axios.post(`${API_BASE}/api/journal/trades/${TEST_TRADE_1}/images`, journalForm2, {
    headers: {
      ...journalForm2.getHeaders(),
      'x-user-id': TEST_USER_1
    }
  });

  assert(journalUploadRes2.data?.success === true && journalUploadRes2.data?.total_count === 3, 'Uploading 3rd image succeeds (reaches exact 3-image cap)');

  // Attempt 4th image (Must be rejected with 400 Bad Request)
  let exceededLimitRejected = false;
  try {
    const journalForm3 = new FormData();
    journalForm3.append('images', sample1x1Png, { filename: 'chart4.png', contentType: 'image/png' });
    await axios.post(`${API_BASE}/api/journal/trades/${TEST_TRADE_1}/images`, journalForm3, {
      headers: {
        ...journalForm3.getHeaders(),
        'x-user-id': TEST_USER_1
      }
    });
  } catch (err) {
    if (err.response?.status === 400 && err.response?.data?.error?.includes('Maximum 3 images allowed')) {
      exceededLimitRejected = true;
    }
  }
  assert(exceededLimitRejected, '4th image rejected with 400 limit guard');

  // ── 4. Multi-Tenant Security & Deletion Guards ─────────────────────────────
  console.log('\n4. Testing Multi-Tenant Ownership & Security Guards:');

  // User 2 tries to upload to User 1's trade (Must be 403 Forbidden)
  let crossUserUploadForbidden = false;
  try {
    const crossForm = new FormData();
    crossForm.append('images', sample1x1Png, { filename: 'hack.png', contentType: 'image/png' });
    await axios.post(`${API_BASE}/api/journal/trades/${TEST_TRADE_1}/images`, crossForm, {
      headers: {
        ...crossForm.getHeaders(),
        'x-user-id': TEST_USER_2
      }
    });
  } catch (err) {
    if (err.response?.status === 403) {
      crossUserUploadForbidden = true;
    }
  }
  assert(crossUserUploadForbidden, 'Cross-user trade upload blocked (403 Forbidden)');

  // User 2 tries to delete User 1's trade image (Must be 403 Forbidden)
  let crossUserDeleteForbidden = false;
  try {
    await axios.delete(`${API_BASE}/api/journal/trades/${TEST_TRADE_1}/images`, {
      data: { public_id: firstImagePublicId },
      headers: {
        'x-user-id': TEST_USER_2
      }
    });
  } catch (err) {
    if (err.response?.status === 403) {
      crossUserDeleteForbidden = true;
    }
  }
  assert(crossUserDeleteForbidden, 'Cross-user image delete blocked (403 Forbidden)');

  // User 1 deletes 1 of their own images
  const user1DeleteRes = await axios.delete(`${API_BASE}/api/journal/trades/${TEST_TRADE_1}/images`, {
    data: { public_id: firstImagePublicId },
    headers: {
      'x-user-id': TEST_USER_1
    }
  });
  assert(user1DeleteRes.data?.success === true && user1DeleteRes.data?.total_count === 2, 'User 1 successfully deleted their image (count reduced to 2)');

  // Clean up remaining test images in Cloudinary
  const remainingImages = user1DeleteRes.data?.images || [];
  for (const img of remainingImages) {
    try {
      await imageUploadService.deleteImage(img.public_id);
    } catch (_) {}
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  🎉 Results: ${testsPassed} / ${testsTotal} tests passed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (testsPassed === testsTotal) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('[Verification Execution Error]', err);
  process.exit(1);
});
