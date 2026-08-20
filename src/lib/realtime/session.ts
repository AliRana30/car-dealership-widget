import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, getOrFetchSupabaseBrowserClient } from '@/lib/supabaseClient';

export interface NavigationEventPayload {
  url: string;
  entityId?: string;
  title?: string;
  action?: 'navigate' | 'open_modal' | 'highlight';
  timestamp?: number;
}

export interface SessionRealtimeEvent {
  type: 'broadcast';
  event: 'navigate' | 'ui_action' | 'test' | string;
  payload: Record<string, any>;
}

/**
 * Returns the standardized channel name for a session
 */
export function getSessionChannelName(sessionId: string): string {
  return `widget-session:${sessionId}`;
}

/**
 * Server-side helper: broadcast an event to a session-scoped Supabase Realtime channel
 */
export async function broadcastToSession(
  sessionId: string,
  event: 'navigate' | 'ui_action' | 'test' | string,
  payload: Record<string, any>
): Promise<{ success: boolean; channel: string; error?: string }> {
  if (!sessionId) {
    return { success: false, channel: '', error: 'Session ID is required' };
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    const errorMsg = 'Missing SUPABASE_URL or SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY for session broadcast';
    console.error(`[realtime] ${errorMsg}`);
    return { success: false, channel: '', error: errorMsg };
  }

  const supabase = createClient(url, key);
  const channelName = getSessionChannelName(sessionId);

  try {
    const channel = supabase.channel(channelName);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // Avoid blocking indefinitely if realtime cluster is unreachable
      }, 2500);

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.send({
              type: 'broadcast',
              event,
              payload: {
                ...payload,
                timestamp: Date.now(),
              },
            });
            clearTimeout(timeout);
            resolve();
          } catch (sendErr) {
            clearTimeout(timeout);
            reject(sendErr);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // Cleanup server channel instance
    setTimeout(() => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    }, 500);

    return { success: true, channel: channelName };
  } catch (err: any) {
    console.error(`[realtime] Error broadcasting to ${channelName}:`, err);
    return { success: false, channel: channelName, error: err.message };
  }
}

/**
 * Client-side helper: subscribe to a session's realtime channel with clean unsubscribe
 */
export function subscribeToSessionChannel(
  sessionId: string,
  onEvent: (event: string, payload: any) => void
): () => void {
  if (typeof window === 'undefined' || !sessionId) {
    return () => {};
  }

  let activeChannel: RealtimeChannel | null = null;
  let isCancelled = false;

  getOrFetchSupabaseBrowserClient().then((supabase) => {
    if (isCancelled || !supabase) return;

    const channelName = getSessionChannelName(sessionId);
    const channel = supabase.channel(channelName);
    activeChannel = channel;

    channel
      .on('broadcast', { event: '*' }, (payload: any) => {
        if (payload && payload.event) {
          onEvent(payload.event, payload.payload);
        }
      })
      .subscribe((status) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Realtime Session] Channel ${channelName} status:`, status);
        }
      });
  });

  // Return clean teardown function
  return () => {
    isCancelled = true;
    if (activeChannel) {
      try {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          supabase.removeChannel(activeChannel);
        }
      } catch (err) {
        console.warn(`[Realtime Session] Error cleaning up channel:`, err);
      }
    }
  };
}
