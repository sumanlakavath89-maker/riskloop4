/**
 * Official Source Discovery Service
 * 
 * Automates real official government release discovery:
 * 1. Fetches official RSS/XML feeds (PIB, RBI) or portal listings (DPIIT).
 * 2. Parses individual <item> entries (extracts title, link, pubDate, description).
 * 3. Applies deterministic candidate filtering (keywords, date congruence, domain whitelist).
 * 4. Rejects old archived releases or mismatched dates.
 * 5. Follows individual official article links and extracts readable text.
 * 6. Passes validated text and official URL to OfficialReleaseIngestionService.
 */

import axios from 'axios';
import { ALLOWED_OFFICIAL_DOMAINS, officialReleaseIngestionService } from './OfficialReleaseIngestionService.js';

export const OFFICIAL_DISCOVERY_FEEDS = {
  PIB_PRESS: 'https://pib.gov.in/RssMain.aspx?ModId=6',
  RBI_PRESS: 'https://www.rbi.org.in/rss.aspx',
  DPIIT_WPI: 'https://eaindustry.nic.in'
};

export const INDICATOR_KEYWORDS = {
  'CPI Inflation': [
    /Consumer Price Index/i,
    /\bCPI\b/i,
    /retail inflation/i,
    /All India CPI/i
  ],
  'IIP': [
    /Index of Industrial Production/i,
    /\bIIP\b/i,
    /Quick Estimates of (?:Index of Industrial Production|IIP)/i,
    /industrial output/i
  ],
  'WPI Inflation': [
    /Wholesale Price/i,
    /\bWPI\b/i,
    /wholesale inflation/i,
    /Index Numbers of Wholesale Price/i
  ],
  'GDP': [
    /Gross Domestic Product/i,
    /\bGDP\b/i,
    /Quarterly Estimates of GDP/i,
    /National Accounts/i
  ],
  'RBI Monetary Policy / Repo Rate': [
    /Monetary Policy Committee/i,
    /\bMPC Resolution\b/i,
    /Policy Repo Rate/i,
    /Monetary Policy Statement/i,
    /Governor's Statement/i
  ]
};

class OfficialSourceDiscoveryService {
  constructor() {
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'RiskLoop-Official-Source-Discovery/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/json'
      }
    });
  }

  /**
   * Helper: Parse XML/RSS string into structured array of items
   * Extracts <item> / <entry> nodes without third-party XML bloat
   */
  parseRssXml(xmlString) {
    if (!xmlString || typeof xmlString !== 'string') {
      return [];
    }

    const items = [];
    const itemRegex = /<item(?:[\s\S]*?)>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xmlString)) !== null) {
      const itemBlock = match[1];

      // Extract title
      const titleMatch = itemBlock.match(/<title(?:[\s\S]*?)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
      const rawTitle = titleMatch ? (titleMatch[1] || titleMatch[2] || '') : '';
      const title = this.cleanHtmlEntities(rawTitle.trim());

      // Extract link
      const linkMatch = itemBlock.match(/<link(?:[\s\S]*?)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/i);
      const rawLink = linkMatch ? (linkMatch[1] || linkMatch[2] || '') : '';
      const link = rawLink.trim();

      // Extract pubDate
      const pubDateMatch = itemBlock.match(/<pubDate(?:[\s\S]*?)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/pubDate>/i) ||
                           itemBlock.match(/<dc:date(?:[\s\S]*?)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/dc:date>/i);
      const rawPubDate = pubDateMatch ? (pubDateMatch[1] || pubDateMatch[2] || '') : '';
      const publishedDate = this.normalizeDateToKolkata(rawPubDate.trim());

      // Extract description
      const descMatch = itemBlock.match(/<description(?:[\s\S]*?)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/description>/i);
      const rawDesc = descMatch ? (descMatch[1] || descMatch[2] || '') : '';
      const description = this.cleanHtmlEntities(this.stripHtml(rawDesc).trim());

      if (title && link) {
        items.push({
          title,
          link,
          rawPubDate: rawPubDate.trim(),
          publishedDate, // YYYY-MM-DD
          description
        });
      }
    }

    return items;
  }

  /**
   * Helper: Parse HTML listing page for links (e.g. DPIIT WPI portal)
   */
  parseHtmlListing(htmlString, baseUrl = 'https://eaindustry.nic.in') {
    if (!htmlString || typeof htmlString !== 'string') {
      return [];
    }

    const items = [];
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(htmlString)) !== null) {
      const href = match[1].trim();
      const text = this.cleanHtmlEntities(this.stripHtml(match[2]).trim());

      if (!href || !text || href.startsWith('#') || href.startsWith('javascript:')) {
        continue;
      }

      let absoluteUrl = href;
      if (href.startsWith('/')) {
        const urlObj = new URL(baseUrl);
        absoluteUrl = `${urlObj.origin}${href}`;
      } else if (!href.startsWith('http://') && !href.startsWith('https://')) {
        absoluteUrl = `${baseUrl.replace(/\/+$/, '')}/${href}`;
      }

      items.push({
        title: text,
        link: absoluteUrl,
        rawPubDate: '',
        publishedDate: null,
        description: text
      });
    }

    return items;
  }

  /**
   * Helper: Convert raw date string into Asia/Kolkata YYYY-MM-DD
   */
  normalizeDateToKolkata(dateStr) {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;

      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    } catch {
      return null;
    }
  }

  /**
   * Clean HTML entities (&amp;, &nbsp;, etc.)
   */
  cleanHtmlEntities(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Strip HTML tags
   */
  stripHtml(str) {
    return str.replace(/<[^>]*>/g, ' ');
  }

  /**
   * Deterministic candidate filtering and scoring
   * Validates:
   * 1. Official domain whitelist
   * 2. Indicator keyword match
   * 3. Publication date congruence & anti-archive check
   */
  evaluateCandidate(item, targetEvent) {
    const rejections = [];
    const confidenceReasons = [];

    // 1. Official Domain Whitelist
    const urlValidation = officialReleaseIngestionService.validateOfficialSourceUrl(item.link);
    if (!urlValidation.valid) {
      rejections.push(`NON_OFFICIAL_DOMAIN: ${urlValidation.reason}`);
    } else {
      confidenceReasons.push('official_domain');
    }

    // 2. Keyword Match for Target Indicator
    const patterns = INDICATOR_KEYWORDS[targetEvent.event_name] || [];
    const combinedText = `${item.title} ${item.description || ''}`;
    const hasKeywordMatch = patterns.some(p => p.test(combinedText));

    if (!hasKeywordMatch) {
      rejections.push(`KEYWORD_MISMATCH: Title "${item.title}" does not contain required keywords for ${targetEvent.event_name}`);
    } else {
      confidenceReasons.push('keyword_match');
    }

    // 3. Date Congruence & Anti-Archive Verification
    if (item.publishedDate && targetEvent.event_date) {
      const pubD = new Date(item.publishedDate);
      const schedD = new Date(targetEvent.event_date);
      const dayDiff = Math.abs((schedD - pubD) / (1000 * 60 * 60 * 24));

      // Reject if deviation > 3 days (prevents ingesting past month archived releases)
      if (dayDiff > 3) {
        rejections.push(`DATE_INCONGRUENT_OR_OLD_ARCHIVE: Item published on ${item.publishedDate}, target event is ${targetEvent.event_date} (day difference: ${dayDiff} days)`);
      } else {
        confidenceReasons.push('date_match');
      }
    }

    const isApproved = rejections.length === 0;

    return {
      approved: isApproved,
      candidate: {
        title: item.title,
        publishedAt: item.publishedDate || item.rawPubDate || 'unknown',
        sourceUrl: item.link,
        sourceDomain: urlValidation.valid ? 'official' : 'untrusted',
        confidenceReason: confidenceReasons
      },
      rejections
    };
  }

  /**
   * Fetch individual official article HTML and extract main article text
   */
  async fetchArticleContent(url) {
    const domainCheck = officialReleaseIngestionService.validateOfficialSourceUrl(url);
    if (!domainCheck.valid) {
      throw new Error(`Cannot fetch article: ${domainCheck.reason}`);
    }

    const response = await this.httpClient.get(url);
    const rawHtml = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    // Extract readable body text
    const cleanText = this.cleanHtmlEntities(this.stripHtml(rawHtml));

    return {
      url,
      cleanText,
      rawHtml
    };
  }

  /**
   * Complete End-to-End Discovery Pipeline for a Scheduled Event
   * 
   * 1. Fetches official feed/listing
   * 2. Parses individual items
   * 3. Finds and filters candidate releases
   * 4. Fetches the winning article
   * 5. Parses macroeconomic metric
   */
  async discoverAndExtractRelease(event, options = {}) {
    const { customFeedXml = null, customHtmlListing = null } = options;

    let feedContent = '';
    let feedUrl = '';

    if (/RBI|Repo Rate|Monetary Policy/i.test(event.event_name)) {
      feedUrl = OFFICIAL_DISCOVERY_FEEDS.RBI_PRESS;
    } else if (/WPI/i.test(event.event_name)) {
      feedUrl = OFFICIAL_DISCOVERY_FEEDS.DPIIT_WPI;
    } else {
      feedUrl = OFFICIAL_DISCOVERY_FEEDS.PIB_PRESS;
    }

    // 1. Fetch feed
    if (customFeedXml) {
      feedContent = customFeedXml;
    } else if (customHtmlListing) {
      feedContent = customHtmlListing;
    } else {
      try {
        const response = await this.httpClient.get(feedUrl);
        feedContent = typeof response.data === 'string' ? response.data : '';
      } catch (err) {
        return {
          found: false,
          error: 'FEED_FETCH_FAILED',
          message: `Failed to fetch official feed at ${feedUrl}: ${err.message}`,
          feedUrl
        };
      }
    }

    // 2. Parse Items
    const items = /WPI/i.test(event.event_name) && (customHtmlListing || feedContent.includes('<html'))
      ? this.parseHtmlListing(feedContent, feedUrl)
      : this.parseRssXml(feedContent);

    if (items.length === 0) {
      return {
        found: false,
        error: 'NO_ITEMS_FOUND',
        message: `Parsed 0 items from feed ${feedUrl}`,
        feedUrl
      };
    }

    // 3. Evaluate Candidates
    const evaluated = [];
    let winningCandidate = null;

    for (const item of items) {
      const evalResult = this.evaluateCandidate(item, event);
      evaluated.push(evalResult);

      if (evalResult.approved && !winningCandidate) {
        winningCandidate = evalResult.candidate;
      }
    }

    if (!winningCandidate) {
      return {
        found: false,
        reason: 'NO_MATCHING_CANDIDATE_APPROVED',
        totalItemsParsed: items.length,
        evaluatedCandidates: evaluated
      };
    }

    // 4. Fetch the individual official article URL
    let articleText = '';
    try {
      if (options.customArticleFetcher) {
        articleText = await options.customArticleFetcher(winningCandidate.sourceUrl);
      } else {
        const articleData = await this.fetchArticleContent(winningCandidate.sourceUrl);
        articleText = articleData.cleanText;
      }
    } catch (fetchErr) {
      return {
        found: true,
        candidate: winningCandidate,
        error: 'ARTICLE_FETCH_FAILED',
        message: `Could not fetch article at ${winningCandidate.sourceUrl}: ${fetchErr.message}`
      };
    }

    // 5. Parse Metric from Article
    const parsedMetric = officialReleaseIngestionService.parseReleaseContent(
      articleText,
      winningCandidate.title
    );

    return {
      found: true,
      candidate: winningCandidate,
      extractedMetric: parsedMetric,
      articleUrl: winningCandidate.sourceUrl,
      rawArticleTextSnippet: articleText.substring(0, 300)
    };
  }
}

export const officialSourceDiscoveryService = new OfficialSourceDiscoveryService();
