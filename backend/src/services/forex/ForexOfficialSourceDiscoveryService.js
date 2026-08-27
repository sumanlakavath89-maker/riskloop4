/**
 * Forex Official Source Discovery Service
 * 
 * Re-exports and coordinates UnifiedForexDiscoveryService for backwards compatibility.
 */

import {
  UnifiedForexDiscoveryService,
  unifiedForexDiscoveryService
} from './UnifiedForexDiscoveryService.js';

export {
  UnifiedForexDiscoveryService,
  unifiedForexDiscoveryService,
  unifiedForexDiscoveryService as forexOfficialSourceDiscoveryService
};

export class ForexOfficialSourceDiscoveryService extends UnifiedForexDiscoveryService {}
