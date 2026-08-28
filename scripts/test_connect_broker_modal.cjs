// Automated Test for Connect Broker Button & Supported Brokers & Exchanges Modal
const fs = require('fs');
const path = require('path');

console.log('Testing Connect Broker Button & Supported Brokers Modal...');

// 1. Verify files exist and include expected handlers
const htmlCode = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const portfolioCode = fs.readFileSync(path.join(__dirname, '../portfolio.js'), 'utf8');
const brokersCode = fs.readFileSync(path.join(__dirname, '../brokers.js'), 'utf8');

if (!htmlCode.includes('id="allBrokersModal"')) {
  throw new Error('FAIL: allBrokersModal not found in index.html');
}
if (!htmlCode.includes('Supported Brokers & Exchanges')) {
  throw new Error('FAIL: Modal title not found in index.html');
}
if (!htmlCode.includes('id="brokersTopConnectBtn"')) {
  throw new Error('FAIL: brokersTopConnectBtn not found in index.html');
}
if (!htmlCode.includes('data-cat="all"')) {
  throw new Error('FAIL: View All tab not found in index.html');
}

// 2. Mock environment to test modal behavior
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

const mockCtx = {
  setTransform: () => {},
  clearRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  stroke: () => {},
  fill: () => {},
  arc: () => {},
  fillRect: () => {},
  setLineDash: () => {},
  fillText: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} })
};

const domElements = {};
function getOrCreateEl(id) {
  if (!domElements[id]) {
    domElements[id] = {
      id,
      style: { display: 'none' },
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      setAttribute: () => {},
      getAttribute: () => '',
      getContext: () => mockCtx,
      parentElement: { clientWidth: 600 },
      addEventListener: () => {},
      removeEventListener: () => {},
      textContent: '',
      className: '',
      innerHTML: '',
      hidden: false
    };
  }
  return domElements[id];
}

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  devicePixelRatio: 1,
  location: { hash: '' }
};
global.document = {
  getElementById: (id) => getOrCreateEl(id),
  querySelectorAll: (selector) => {
    if (selector === '.broker-catalog-card') {
      const grid = getOrCreateEl('allBrokersGrid');
      const matches = [];
      const parts = grid.innerHTML.split('<div class="broker-catalog-card');
      parts.slice(1).forEach((part, idx) => {
        const catMatch = part.match(/data-cat="([^"]+)"/);
        const featMatch = part.match(/data-featured="([^"]+)"/);
        const nameMatch = part.match(/data-name="([^"]+)"/);
        const isExpander = part.includes('bkViewAllExpanderCard') || part.includes('View All 18+');

        const cardObj = {
          id: isExpander ? 'bkViewAllExpanderCard' : `card_${idx}`,
          style: { display: 'flex' },
          getAttribute: (attr) => {
            if (attr === 'data-cat') return catMatch ? catMatch[1] : '';
            if (attr === 'data-featured') return featMatch ? featMatch[1] : 'false';
            if (attr === 'data-name') return nameMatch ? nameMatch[1] : '';
            return '';
          }
        };
        matches.push(cardObj);
      });
      return matches;
    }
    if (selector === '.broker-modal-tab') {
      return [
        { getAttribute: () => 'all', style: {} },
        { getAttribute: () => 'indian', style: {} },
        { getAttribute: () => 'forex', style: {} },
        { getAttribute: () => 'crypto', style: {} }
      ];
    }
    return [];
  },
  querySelector: (sel) => {
    if (sel === '#bkViewAllExpanderCard') return getOrCreateEl('bkViewAllExpanderCard');
    return null;
  },
  addEventListener: () => {},
  body: { style: {} },
  readyState: 'complete'
};

// Evaluate portfolio.js and brokers.js
eval(portfolioCode);
eval(brokersCode);

if (typeof window.openAllBrokersModal !== 'function') {
  throw new Error('FAIL: window.openAllBrokersModal is not defined');
}
if (typeof window.closeAllBrokersModal !== 'function') {
  throw new Error('FAIL: window.closeAllBrokersModal is not defined');
}

// 3. Test opening the modal when NO broker is connected
localStorage.clear();
window.openAllBrokersModal();

const modalEl = getOrCreateEl('allBrokersModal');
const gridEl = getOrCreateEl('allBrokersGrid');

console.log('Modal display after open:', modalEl.style.display);
if (modalEl.style.display !== 'flex') {
  throw new Error('FAIL: Modal display should be flex after openAllBrokersModal()');
}

// Check rendered content: 3 Indian (Angel One, Zerodha, Dhan) and 3 Forex (MetaTrader 5, Vantage, Exness)
console.log('PASS: Modal opened successfully');
if (!gridEl.innerHTML.includes('Angel One') || !gridEl.innerHTML.includes('Zerodha Kite') || !gridEl.innerHTML.includes('Dhan')) {
  throw new Error('FAIL: 3 Featured Indian brokers not found in grid');
}
if (!gridEl.innerHTML.includes('MetaTrader 5') || !gridEl.innerHTML.includes('Vantage') || !gridEl.innerHTML.includes('Exness')) {
  throw new Error('FAIL: 3 Featured Forex brokers not found in grid');
}
if (!gridEl.innerHTML.includes('View All 18+ Brokers')) {
  throw new Error('FAIL: View All expander not found in grid');
}
console.log('PASS: Featured 3 Indian + 3 Forex layout with View All expander verified!');

// 4. Test View All tab click
window.setBrokerModalCat('all');
console.log('PASS: setBrokerModalCat("all") executed successfully');

// 5. Test connecting a real broker
localStorage.setItem('riskloop_connected_brokers', JSON.stringify([
  { id: 'angelone', name: 'Angel One', brokerName: 'Angel One', connected: true }
]));

window.openAllBrokersModal();
if (!gridEl.innerHTML.includes('broker-card-connected')) {
  throw new Error('FAIL: Angel One should have class broker-card-connected');
}
if (!gridEl.innerHTML.includes('Connected')) {
  throw new Error('FAIL: Angel One should display Connected badge');
}
console.log('PASS: Real connected broker dynamically detected and marked as Connected');

// 6. Test closing the modal
window.closeAllBrokersModal();
if (modalEl.style.display !== 'none') {
  throw new Error('FAIL: Modal display should be none after closeAllBrokersModal()');
}
console.log('PASS: Modal closed successfully');

console.log('\nALL CONNECT BROKER MODAL TESTS PASSED! 🚀');
