import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/**
 * Returns a singleton browser-safe Supabase client configured for Realtime channels
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-anon-key';

  browserClient = createClient(url, anonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return browserClient;
}
