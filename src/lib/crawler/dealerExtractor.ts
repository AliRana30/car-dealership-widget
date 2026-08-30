/**
 * Dealership Information & Business Hours Extractor and Persister
 * 
 * Separates Dealership Data (Location, Contact, 7-Day Hours, Departments)
 * from Vehicle Data and General Website Knowledge per Prompt 3B requirements.
 */

import type { Pool } from 'pg';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    const { Pool } = require('pg');
    _pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
  }
  return _pool!;
}

export interface RawDealerInfo {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  provinceState?: string;
  postalCode?: string;
  country?: string;
  websiteUrl?: string;
  logoUrl?: string;
  description?: string;
  hours?: Array<{
    dayOfWeek: number; // 0=Sunday .. 6=Saturday
    openTime?: string; // e.g. "09:00:00"
    closeTime?: string; // e.g. "20:00:00"
    isClosed?: boolean;
    notes?: string;
  }>;
}

/**
 * Parses Schema.org openingHours strings (e.g. "Mo-Fr 09:00-20:00", "Sa 09:00-17:00", "Su Closed")
 * or openingHoursSpecification objects into normalized 7-day schedule array.
 */
export function parseOpeningHours(rawHours: any): RawDealerInfo['hours'] {
  if (!rawHours) return undefined;
  const schedule: Map<number, { openTime?: string; closeTime?: string; isClosed: boolean; notes?: string }> = new Map();

  // Initialize all 7 days as closed by default
  for (let i = 0; i <= 6; i++) {
    schedule.set(i, { isClosed: true });
  }

  const DAY_MAP: Record<string, number> = {
    'su': 0, 'sun': 0, 'sunday': 0,
    'mo': 1, 'mon': 1, 'monday': 1,
    'tu': 2, 'tue': 2, 'tuesday': 2,
    'we': 3, 'wed': 3, 'wednesday': 3,
    'th': 4, 'thu': 4, 'thursday': 4,
    'fr': 5, 'fri': 5, 'friday': 5,
    'sa': 6, 'sat': 6, 'saturday': 6,
  };

  const applyTimeRange = (startDay: number, endDay: number, open?: string, close?: string, isClosed = false) => {
    let curr = startDay;
    while (true) {
      schedule.set(curr, {
        openTime: open,
        closeTime: close,
        isClosed: isClosed || (!open && !close),
      });
      if (curr === endDay) break;
      curr = (curr + 1) % 7;
    }
  };

  const parseTimeString = (str: string): string | undefined => {
    if (!str) return undefined;
    const match = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return undefined;
    let hours = parseInt(match[1], 10);
    const mins = match[2] ? match[2] : '00';
    const ampm = match[3]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${mins}:00`;
  };

  if (Array.isArray(rawHours)) {
    for (const item of rawHours) {
      if (typeof item === 'string') {
        // e.g. "Mo-Fr 09:00-20:00" or "Su 10:00-16:00" or "Su Closed"
        const parts = item.split(/\s+/);
        if (parts.length >= 2) {
          const daysPart = parts[0].toLowerCase();
          const timePart = parts.slice(1).join(' ').toLowerCase();

          let startDay = 1, endDay = 1;
          if (daysPart.includes('-')) {
            const [d1, d2] = daysPart.split('-');
            startDay = DAY_MAP[d1] ?? 1;
            endDay = DAY_MAP[d2] ?? 5;
          } else {
            startDay = DAY_MAP[daysPart] ?? 1;
            endDay = startDay;
          }

          if (timePart.includes('closed') || timePart.includes('off')) {
            applyTimeRange(startDay, endDay, undefined, undefined, true);
          } else if (timePart.includes('-')) {
            const [t1, t2] = timePart.split('-');
            applyTimeRange(startDay, endDay, parseTimeString(t1), parseTimeString(t2), false);
          }
        }
      } else if (typeof item === 'object' && item !== null) {
        // Schema.org OpeningHoursSpecification
        const days = Array.isArray(item.dayOfWeek) ? item.dayOfWeek : [item.dayOfWeek];
        const opens = parseTimeString(item.opens || item.openTime);
        const closes = parseTimeString(item.closes || item.closeTime);

        for (const day of days) {
          const dStr = String(day || '').toLowerCase().replace('http://schema.org/', '').replace('https://schema.org/', '');
          const dNum = DAY_MAP[dStr];
          if (dNum !== undefined) {
            schedule.set(dNum, {
              openTime: opens,
              closeTime: closes,
              isClosed: !opens && !closes,
            });
          }
        }
      }
    }
  }

  const result: RawDealerInfo['hours'] = [];
  for (let i = 0; i <= 6; i++) {
    const s = schedule.get(i)!;
    result.push({
      dayOfWeek: i,
      openTime: s.openTime,
      closeTime: s.closeTime,
      isClosed: s.isClosed,
    });
  }

  return result;
}

/**
 * Extracts dealership profile and hours from page entities (JSON-LD AutoDealer, LocalBusiness, Contact entities)
 */
export function extractDealerInfoFromEntities(entities: any[], originUrl: string): RawDealerInfo | null {
  for (const e of entities) {
    const meta = e.metadata || {};
    const isDealer =
      e.dataType === 'contact' ||
      meta.discoveryMethod === 'json-ld' && (meta.phone || meta.address || meta.hours) ||
      /dealer|chrysler|jeep|dodge|ram|ford|hyundai|toyota|honda|automotive|motors|sales/i.test(e.title || '');

    if (isDealer && (meta.phone || meta.address || meta.hours || meta.email)) {
      let parsedHours: RawDealerInfo['hours'] = undefined;
      if (meta.hours) {
        try {
          const raw = typeof meta.hours === 'string' ? JSON.parse(meta.hours) : meta.hours;
          parsedHours = parseOpeningHours(raw);
        } catch {
          if (typeof meta.hours === 'string') parsedHours = parseOpeningHours([meta.hours]);
        }
      }

      // Address parsing
      let addressStr = typeof meta.address === 'string' ? meta.address : undefined;
      let city = meta.city;
      let provinceState = meta.provinceState || meta.state;
      let postalCode = meta.postalCode || meta.zip;

      if (typeof meta.address === 'object' && meta.address !== null) {
        addressStr = meta.address.streetAddress || meta.address.addressLocality || '';
        city = meta.address.addressLocality || city;
        provinceState = meta.address.addressRegion || provinceState;
        postalCode = meta.address.postalCode || postalCode;
      }

      const dealerCode = new URL(originUrl).hostname.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

      return {
        name: e.title || meta.name || 'Dealership',
        phone: meta.phone || meta.telephone,
        email: meta.email,
        address: addressStr,
        city,
        provinceState,
        postalCode,
        country: meta.country || (originUrl.includes('.ca') ? 'CA' : 'US'),
        websiteUrl: originUrl,
        logoUrl: Array.isArray(meta.images) && meta.images.length > 0 ? meta.images[0] : (typeof meta.image === 'string' ? meta.image : undefined),
        description: meta.description || e.content,
        hours: parsedHours,
      };
    }
  }

  return null;
}

/**
 * Persists Dealership Profile and 7-Day Business Hours into Supabase tables
 */
export async function persistDealerProfileAndHours(
  websiteId: string,
  dealerInfo: RawDealerInfo
): Promise<{ profileId: string; hoursInserted: number } | null> {
  const pool = getPool();
  try {
    // 1. Find or create organization for website
    const { rows: orgRows } = await pool.query(
      `SELECT organization_id FROM websites WHERE id = $1 LIMIT 1`,
      [websiteId]
    );
    let organizationId = orgRows[0]?.organization_id;

    if (!organizationId) {
      const { rows: anyOrg } = await pool.query(`SELECT id FROM organizations LIMIT 1`);
      organizationId = anyOrg[0]?.id;
    }

    if (!organizationId) {
      console.warn('[dealerExtractor] No organization found to attach dealer profile');
      return null;
    }

    const dealerCode = new URL(dealerInfo.websiteUrl || 'https://dealership.local').hostname.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    // 2. Upsert dealer_profiles
    const { rows: profileRows } = await pool.query(
      `
      INSERT INTO dealer_profiles (
        organization_id, website_id, dealer_code, name, website_url,
        phone, email, address, city, province_state, postal_code, country,
        logo_url, description, last_verified_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
      )
      ON CONFLICT (dealer_code) DO UPDATE SET
        name = EXCLUDED.name,
        website_url = EXCLUDED.website_url,
        phone = COALESCE(EXCLUDED.phone, dealer_profiles.phone),
        email = COALESCE(EXCLUDED.email, dealer_profiles.email),
        address = COALESCE(EXCLUDED.address, dealer_profiles.address),
        city = COALESCE(EXCLUDED.city, dealer_profiles.city),
        province_state = COALESCE(EXCLUDED.province_state, dealer_profiles.province_state),
        postal_code = COALESCE(EXCLUDED.postal_code, dealer_profiles.postal_code),
        last_verified_at = NOW(),
        updated_at = NOW()
      RETURNING id
      `,
      [
        organizationId,
        websiteId,
        dealerCode,
        dealerInfo.name || 'Automotive Dealership',
        dealerInfo.websiteUrl,
        dealerInfo.phone || null,
        dealerInfo.email || null,
        dealerInfo.address || null,
        dealerInfo.city || null,
        dealerInfo.provinceState || null,
        dealerInfo.postalCode || null,
        dealerInfo.country || 'CA',
        dealerInfo.logoUrl || null,
        dealerInfo.description || null,
      ]
    );

    const profileId = profileRows[0]?.id;
    if (!profileId) return null;

    // 3. Upsert dealer_hours for all days
    let hoursCount = 0;
    if (Array.isArray(dealerInfo.hours) && dealerInfo.hours.length > 0) {
      for (const h of dealerInfo.hours) {
        await pool.query(
          `
          INSERT INTO dealer_hours (
            dealer_profile_id, day_of_week, open_time, close_time, is_closed, notes, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, NOW()
          )
          ON CONFLICT (dealer_profile_id, day_of_week) DO UPDATE SET
            open_time = EXCLUDED.open_time,
            close_time = EXCLUDED.close_time,
            is_closed = EXCLUDED.is_closed,
            notes = EXCLUDED.notes,
            updated_at = NOW()
          `,
          [
            profileId,
            h.dayOfWeek,
            h.openTime || null,
            h.closeTime || null,
            h.isClosed ?? false,
            h.notes || null,
          ]
        );
        hoursCount++;
      }
    }

    console.log(`[dealerExtractor] Persisted dealer profile '${dealerInfo.name}' (${profileId}) with ${hoursCount} schedule rows`);
    return { profileId, hoursInserted: hoursCount };
  } catch (err: any) {
    console.error('[dealerExtractor] Failed persisting dealer profile/hours:', err.message);
    return null;
  }
}
