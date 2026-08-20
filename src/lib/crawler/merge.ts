/**
 * Entity Precedence & Merge Module
 *
 * Resolves conflicts between authoritative platform connectors (Shopify, WooCommerce, Feed, Manual)
 * and crawled / JSON-LD extractions. Ensures connector fields are never overwritten while filling
 * in missing attributes (e.g. ratings, review counts, specs).
 */

import { WebsiteDataRow } from '@/config/widgetsDb';

const CONNECTOR_DATA_TYPES = new Set(['shopify', 'woocommerce', 'feed', 'manual']);

/**
 * Checks whether a given data_type represents an authoritative structured platform connector.
 */
export function isConnectorDataType(dataType?: string): boolean {
  if (!dataType) return false;
  return CONNECTOR_DATA_TYPES.has(dataType.toLowerCase());
}

/**
 * Normalizes URL strings for comparison (removes trailing slashes, fragments, protocol differences).
 */
export function normalizeUrl(url?: string): string {
  if (!url) return '';
  try {
    const raw = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(raw);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Finds a matching record in an existing collection using URL, SKU, or external IDs.
 */
export function findMatchingExistingEntity(
  incoming: Partial<WebsiteDataRow>,
  existingRecords: WebsiteDataRow[],
  claimedIds?: Set<string>
): WebsiteDataRow | null {
  if (!existingRecords || existingRecords.length === 0) return null;

  const incomingUrl = normalizeUrl(incoming.source_url);
  const incomingSku = incoming.metadata?.sku ? String(incoming.metadata.sku).trim().toLowerCase() : '';
  const incomingShopifyId = incoming.metadata?.shopifyId ? String(incoming.metadata.shopifyId) : '';
  const incomingWooId = incoming.metadata?.wooId ? String(incoming.metadata.wooId) : '';
  const incomingExternalId = incoming.metadata?.externalId ? String(incoming.metadata.externalId) : '';
  const incomingTitle = incoming.title ? incoming.title.trim().toLowerCase() : '';

  for (const existing of existingRecords) {
    if (claimedIds && existing.id && claimedIds.has(existing.id)) {
      continue;
    }

    const existingTitle = existing.title ? existing.title.trim().toLowerCase() : '';

    // 1. Match by SKU
    if (incomingSku && existing.metadata?.sku) {
      if (String(existing.metadata.sku).trim().toLowerCase() === incomingSku) {
        return existing;
      }
    }

    // 2. Match by platform ID
    if (incomingShopifyId && existing.metadata?.shopifyId === incomingShopifyId) {
      return existing;
    }
    if (incomingWooId && existing.metadata?.wooId === incomingWooId) {
      return existing;
    }
    if (incomingExternalId && existing.metadata?.externalId === incomingExternalId) {
      return existing;
    }

    // 3. Match by exact title + entity_type
    if (
      incomingTitle &&
      existingTitle &&
      existingTitle === incomingTitle &&
      (existing.entity_type || 'product') === (incoming.entity_type || 'product')
    ) {
      return existing;
    }

    // 4. Match by source_url (only if titles match or if one is generic/empty)
    if (incomingUrl && existing.source_url && normalizeUrl(existing.source_url) === incomingUrl) {
      if (!incomingTitle || !existingTitle || incomingTitle === existingTitle || existingTitle.includes(incomingTitle) || incomingTitle.includes(existingTitle)) {
        return existing;
      }
    }
  }

  return null;
}

/**
 * Merges an incoming entity into an existing entity according to authoritative precedence rules.
 * When existing is connector-sourced (Shopify/WooCommerce/Feed/Manual), its fields are strictly
 * preserved and incoming crawled/JSON-LD fields only fill in missing/null attributes.
 */
export function mergeEntity(
  existing: WebsiteDataRow,
  incoming: WebsiteDataRow
): WebsiteDataRow {
  const existingIsConnector = isConnectorDataType(existing.data_type);
  const incomingIsConnector = isConnectorDataType(incoming.data_type);

  const nowIso = new Date().toISOString();
  const first_seen = existing.first_seen || incoming.first_seen || (existing as any).created_at || nowIso;
  const last_seen = incoming.last_seen || nowIso;
  const still_listed = true;

  // If existing is authoritative connector and incoming is a crawl/JSON-LD:
  if (existingIsConnector && !incomingIsConnector) {
    // Preserve existing title unless empty/untitled
    const title = (existing.title && existing.title !== 'Untitled' && existing.title !== 'Untitled Product')
      ? existing.title
      : incoming.title || existing.title;

    // Preserve existing short_description unless empty
    const short_description = existing.short_description
      ? existing.short_description
      : incoming.short_description || '';

    // Preserve existing content unless empty/bare
    const content = (existing.content && existing.content !== existing.title)
      ? existing.content
      : incoming.content || existing.content;

    // Preserve images: if existing has images keep them, otherwise fill from incoming
    const image_urls = (Array.isArray(existing.image_urls) && existing.image_urls.length > 0)
      ? existing.image_urls
      : incoming.image_urls || [];

    // Preserve category_path: if existing has categories keep them, otherwise fill from incoming
    const category_path = (Array.isArray(existing.category_path) && existing.category_path.length > 0)
      ? existing.category_path
      : incoming.category_path || [];

    // Merge metadata: keep existing authoritative connector keys, fill in missing keys from incoming
    const mergedMetadata: Record<string, any> = { ...(existing.metadata || {}) };

    if (incoming.metadata && typeof incoming.metadata === 'object') {
      for (const [key, incomingVal] of Object.entries(incoming.metadata)) {
        const existingVal = mergedMetadata[key];
        const isExistingEmpty =
          existingVal === undefined ||
          existingVal === null ||
          existingVal === '' ||
          (Array.isArray(existingVal) && existingVal.length === 0);

        if (isExistingEmpty && incomingVal !== undefined && incomingVal !== null && incomingVal !== '') {
          // Fill missing attribute (e.g. rating, reviews, aggregateRating, specs) from JSON-LD/crawl
          mergedMetadata[key] = incomingVal;
        }
      }
    }

    return {
      ...existing,
      title,
      short_description,
      content,
      image_urls,
      category_path,
      metadata: mergedMetadata,
      first_seen,
      last_seen,
      still_listed,
      last_checked_at: nowIso,
      // Retain existing connector data_type and id
      data_type: existing.data_type,
      id: existing.id,
      widget_id: existing.widget_id,
      source_url: existing.source_url || incoming.source_url,
      entity_type: existing.entity_type || incoming.entity_type,
    };
  }

  // If incoming is authoritative connector and existing is a crawl:
  if (!existingIsConnector && incomingIsConnector) {
    const mergedMetadata: Record<string, any> = { ...(existing.metadata || {}) };
    // Incoming connector overwrites crawl metadata, keeping non-conflicting crawl keys
    Object.assign(mergedMetadata, incoming.metadata || {});

    return {
      ...incoming,
      id: existing.id,
      widget_id: existing.widget_id,
      metadata: mergedMetadata,
      data_type: incoming.data_type,
      first_seen,
      last_seen,
      still_listed,
      last_checked_at: nowIso,
    };
  }

  // Default: Incoming updates existing, filling missing metadata
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    widget_id: existing.widget_id,
    first_seen,
    last_seen,
    still_listed,
    last_checked_at: nowIso,
    metadata: {
      ...(existing.metadata || {}),
      ...(incoming.metadata || {}),
    },
  };
}
