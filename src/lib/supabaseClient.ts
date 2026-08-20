import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/**
 * Returns a singleton browser-safe Supabase client configured for Realtime channels.
 * Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *
 * If credentials are missing, logs a clear warning and returns null to prevent
 * bogus WebSocket handshake attempts with invalid placeholder keys.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url || !anonKey) {
    if (typeof window !== 'undefined') {
      console.warn(
        '[SupabaseBrowserClient] Realtime disabled: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Please ensure NEXT_PUBLIC_SUPABASE_ANON_KEY is added to your Vercel Project Environment Variables.'
      );
    }
    return null;
  }

  browserClient = createClient(url, anonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return browserClient;
}
