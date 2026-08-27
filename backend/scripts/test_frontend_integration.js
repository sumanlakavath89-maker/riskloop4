/**
 * test_frontend_integration.js
 * Verifies Frontend integration with Cloudinary backend APIs for Profile and Journal
 */

import axios from 'axios';
import FormData from 'form-data';
import { db } from '../src/services/DatabaseService.js';
import imageUploadService from '../src/services/ImageUploadService.js';

const API_BASE = 'http://localhost:3000';
const USER_A = 'frontend_user_alpha';
const USER_B = 'frontend_user_beta';
const TRADE_ID = 'tr-frontend-1001';

const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const sampleWebp = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');

async function testFrontendFlow() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🧪 Running Frontend-to-Backend Cloudinary Integration Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  db.initialize();

  let passed = 0;
  let total = 0;

  function assert(cond, desc) {
    total++;
    if (cond) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
    }
  }

  // 1. Health check
  const health = await axios.get(`${API_BASE}/health`);
  assert(health.status === 200 && health.data?.success === true, 'Server is running and healthy');

  // 2. Profile Avatar: Upload via FormData
  console.log('\n1. Profile Avatar Flow:');
  const profForm1 = new FormData();
  profForm1.append('avatar', samplePng, { filename: 'avatar.png', contentType: 'image/png' });

  const profRes1 = await axios.post(`${API_BASE}/api/profile/avatar`, profForm1, {
    headers: { ...profForm1.getHeaders(), 'x-user-id': USER_A }
  });
  assert(profRes1.data?.success === true, 'Profile avatar uploaded successfully via FormData');
  const avatarUrl1 = profRes1.data?.data?.avatar_url;
  const avatarPub1 = profRes1.data?.data?.public_id;
  assert(avatarUrl1?.startsWith('https://res.cloudinary.com/'), 'Returns valid Cloudinary avatar_url');
  assert(avatarPub1?.startsWith(`riskloop/profiles/${USER_A}/`), 'Avatar public_id is properly isolated');

  // 3. Profile Avatar: Replace
  const profForm2 = new FormData();
  profForm2.append('avatar', sampleWebp, { filename: 'avatar_new.webp', contentType: 'image/webp' });

  const profRes2 = await axios.post(`${API_BASE}/api/profile/avatar`, profForm2, {
    headers: { ...profForm2.getHeaders(), 'x-user-id': USER_A }
  });
  assert(profRes2.data?.success === true, 'Profile avatar replaced successfully');
  const avatarPub2 = profRes2.data?.data?.public_id;
  assert(avatarPub2 && avatarPub2 !== avatarPub1, 'New avatar public_id issued');

  // 4. Profile Avatar: Delete
  const delProf = await axios.delete(`${API_BASE}/api/profile/avatar`, {
    headers: { 'x-user-id': USER_A }
  });
  assert(delProf.data?.success === true, 'DELETE /api/profile/avatar deletes Cloudinary asset and clears DB');

  // 5. Journal Flow: Create Trade and Upload 3 screenshots
  console.log('\n2. Journal Trade Flow (Max 3 Images):');
  db.saveJournalTrade({
    id: TRADE_ID,
    userId: USER_A,
    symbol: 'BANKNIFTY',
    market: 'indian',
    entry: 52400,
    sl: 52250,
    tp: 52750,
    pnl: 3500,
    images: []
  });

  const jForm = new FormData();
  jForm.append('images', samplePng, { filename: 'chart_1.png', contentType: 'image/png' });
  jForm.append('images', samplePng, { filename: 'chart_2.png', contentType: 'image/png' });
  jForm.append('images', sampleWebp, { filename: 'chart_3.webp', contentType: 'image/webp' });

  const jUploadRes = await axios.post(`${API_BASE}/api/journal/trades/${TRADE_ID}/images`, jForm, {
    headers: { ...jForm.getHeaders(), 'x-user-id': USER_A }
  });
  assert(jUploadRes.data?.success === true && jUploadRes.data?.total_count === 3, 'Uploaded 3 images linked to trade');
  const uploadedImages = jUploadRes.data?.images || [];
  assert(uploadedImages.length === 3, 'Trade object contains 3 Cloudinary images');
  assert(uploadedImages.every(img => img.secure_url?.startsWith('https://res.cloudinary.com/')), 'All screenshots have valid HTTPS Cloudinary URLs');

  // 6. Journal: 4th image reject test
  let limitBlocked = false;
  try {
    const extraForm = new FormData();
    extraForm.append('images', samplePng, { filename: 'chart_4.png', contentType: 'image/png' });
    await axios.post(`${API_BASE}/api/journal/trades/${TRADE_ID}/images`, extraForm, {
      headers: { ...extraForm.getHeaders(), 'x-user-id': USER_A }
    });
  } catch (err) {
    if (err.response?.status === 400) limitBlocked = true;
  }
  assert(limitBlocked, '4th image rejected with 400 (3 image maximum strictly enforced)');

  // 7. Journal: Delete individual image
  console.log('\n3. Journal Individual Screenshot Delete:');
  const imgToDelete = uploadedImages[0];
  const delImgRes = await axios.delete(`${API_BASE}/api/journal/trades/${TRADE_ID}/images`, {
    data: { public_id: imgToDelete.public_id },
    headers: { 'x-user-id': USER_A }
  });
  assert(delImgRes.data?.success === true && delImgRes.data?.total_count === 2, 'Individual screenshot deleted, count reduced to 2');

  // 8. Security & Multi-Tenant Isolation
  console.log('\n4. Security & Multi-Tenant Isolation:');
  let unauthorizedDel = false;
  try {
    await axios.delete(`${API_BASE}/api/journal/trades/${TRADE_ID}/images`, {
      data: { public_id: uploadedImages[1].public_id },
      headers: { 'x-user-id': USER_B }
    });
  } catch (err) {
    if (err.response?.status === 403) unauthorizedDel = true;
  }
  assert(unauthorizedDel, 'Cross-user deletion rejected (403 Forbidden)');

  // Clean up remaining test images
  for (const img of delImgRes.data?.images || []) {
    try {
      await imageUploadService.deleteImage(img.public_id);
    } catch (_) {}
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  🎉 Results: ${passed} / ${total} tests passed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (passed === total) process.exit(0);
  else process.exit(1);
}

testFrontendFlow().catch(e => {
  console.error('[Test Error]', e);
  process.exit(1);
});
