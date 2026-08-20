import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * Synchronous client getter (if already initialized or available in env)
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (url && anonKey) {
    browserClient = createClient(url, anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return browserClient;
  }

  return null;
}

/**
 * Asynchronous client getter: if direct env is missing in browser, fetches
 * SUPABASE_URL and SUPABASE_ANON_KEY from /api/realtime/config endpoint.
 */
export async function getOrFetchSupabaseBrowserClient(): Promise<SupabaseClient | null> {
  const existing = getSupabaseBrowserClient();
  if (existing) return existing;

  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    try {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/realtime/config');
        if (res.ok) {
          const data = await res.json();
          if (data.supabaseUrl && data.supabaseAnonKey) {
            browserClient = createClient(data.supabaseUrl, data.supabaseAnonKey, {
              realtime: {
                params: {
                  eventsPerSecond: 10,
                },
              },
            });
            return browserClient;
          }
        }
      }
    } catch (err) {
      console.warn('[SupabaseBrowserClient] Could not fetch realtime config:', err);
    }
    return null;
  })();

  return clientPromise;
}
