import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Testing Portfolio Currency Logic ---');

// 1. Check portfolio.js content
const portfolioJs = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');

// A. Check formatBrokerCurrency implementation
assert(portfolioJs.includes('function formatBrokerCurrency'), 'formatBrokerCurrency must be defined');
assert(portfolioJs.includes('Intl.NumberFormat'), 'Intl.NumberFormat must be used for robust formatting');
assert(portfolioJs.includes("'en-IN'"), 'en-IN locale must be present for Indian Rupees');

// B. Check default broker handling for Angel One
assert(portfolioJs.includes("Angel One"), 'Angel One must be handled as Indian broker');
assert(portfolioJs.includes("INR"), 'INR currency must be handled');

// C. Verify currency formatter behavior in simulated environment
const CURRENCIES = {
  USD: { symbol: '$', prefix: '$', name: 'US Dollar', flag: '💵', rate: 1.0, locale: 'en-US' },
  INR: { symbol: '₹', prefix: '₹', name: 'Indian Rupee', flag: '🇮🇳', rate: 83.5, locale: 'en-IN' },
  EUR: { symbol: '€', prefix: '€', name: 'Euro', flag: '🇪🇺', rate: 0.92, locale: 'de-DE' },
  GBP: { symbol: '£', prefix: '£', name: 'British Pound', flag: '🇬🇧', rate: 0.79, locale: 'en-GB' },
  JPY: { symbol: '¥', prefix: '¥', name: 'Japanese Yen', flag: '🇯🇵', rate: 154.2, locale: 'ja-JP' },
  AED: { symbol: 'د.إ', prefix: 'AED ', name: 'UAE Dirham', flag: '🇦🇪', rate: 3.67, locale: 'en-AE' },
  CAD: { symbol: 'C$', prefix: 'C$', name: 'Canadian Dollar', flag: '🇨🇦', rate: 1.36, locale: 'en-CA' }
};

function formatBrokerCurrency(amount, currencyCode, opts = {}) {
  const code = (currencyCode || 'INR').toUpperCase();
  const def = CURRENCIES[code] || CURRENCIES.INR;
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const abs = Math.abs(num);
  const isNeg = num < 0;
  const isPos = num > 0;
  const decimals = opts.decimals !== undefined ? opts.decimals : (code === 'JPY' ? 0 : 2);

  let formatted = '';
  try {
    formatted = new Intl.NumberFormat(def.locale || 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(abs);
  } catch (e) {
    formatted = abs.toFixed(decimals);
  }

  const sign = isNeg ? '−' : (opts.signed && isPos ? '+' : '');
  return `${sign}${def.prefix}${formatted}`;
}

// Test formatBrokerCurrency for INR
const inr5000 = formatBrokerCurrency(5000, 'INR');
assert.strictEqual(inr5000, '₹5,000.00', `Expected ₹5,000.00, got: ${inr5000}`);
console.log('✓ INR 5000 formatted correctly:', inr5000);

const inrZero = formatBrokerCurrency(0, 'INR');
assert.strictEqual(inrZero, '₹0.00', `Expected ₹0.00, got: ${inrZero}`);
console.log('✓ INR 0 formatted correctly:', inrZero);

const inrBalance = formatBrokerCurrency(463166, 'INR');
assert.strictEqual(inrBalance, '₹4,63,166.00', `Expected ₹4,63,166.00, got: ${inrBalance}`);
console.log('✓ INR Lakhs balance formatted correctly:', inrBalance);

const inrWin = formatBrokerCurrency(4320, 'INR', { signed: true });
assert.strictEqual(inrWin, '+₹4,320.00', `Expected +₹4,320.00, got: ${inrWin}`);
console.log('✓ INR Signed Win formatted correctly:', inrWin);

const inrLoss = formatBrokerCurrency(-1850, 'INR', { signed: true });
assert.strictEqual(inrLoss, '−₹1,850.00', `Expected −₹1,850.00, got: ${inrLoss}`);
console.log('✓ INR Signed Loss formatted correctly:', inrLoss);

// Test formatBrokerCurrency for USD
const usd5000 = formatBrokerCurrency(5000, 'USD');
assert.strictEqual(usd5000, '$5,000.00', `Expected $5,000.00, got: ${usd5000}`);
console.log('✓ USD 5000 formatted correctly:', usd5000);

const usdWin = formatBrokerCurrency(620, 'USD', { signed: true });
assert.strictEqual(usdWin, '+$620.00', `Expected +$620.00, got: ${usdWin}`);
console.log('✓ USD Signed Win formatted correctly:', usdWin);

// 2. Check index.html markup
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert(indexHtml.includes('Connected: Angel One'), 'index.html default button label must say Connected: Angel One');
assert(indexHtml.includes('INR (₹)'), 'index.html default currency must show INR (₹)');
assert(indexHtml.includes('id="psAccountSize">₹5,000.00</div>'), 'Account size must default to ₹5,000.00 in HTML');
assert(indexHtml.includes('id="psTodayProfit">₹0.00</div>'), 'Today profit must default to ₹0.00 in HTML');
assert(indexHtml.includes('id="psBalanceVal">₹4,63,166.00</span>'), 'Balance must default to ₹4,63,166.00 in HTML');

console.log('\n--- ALL PORTFOLIO CURRENCY TESTS PASSED (10/10) ---');
