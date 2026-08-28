import React, { useImperativeHandle, forwardRef, useState, useRef, useEffect, useCallback } from 'react';
import type { RetellWebClient } from 'retell-client-js-sdk';
import { CallState, TranscriptMessage, VoiceWidgetConfig } from '@/config/voiceWidget/types';
export type { CallState };
import { defaultVoiceWidgetConfig, deepMerge } from '@/config/voiceWidget/default';
import { subscribeToSessionChannel } from '@/lib/realtime/session';
import {
  checkMicrophonePermissions,
  preflightMicrophoneAccess,
  createAudioLevelMonitor,
  stopMediaStream,
  verifyRetellMicrophoneAttachment,
  verifyVapiMicrophoneAttachment,
  AudioLevelMonitor,
} from '@/lib/voice/microphonePipeline';
import VoiceAgentLauncher from './VoiceAgentLauncher';
import VoiceAgentPanel from './VoiceAgentPanel';

interface VoiceAgentWidgetProps {
  onCallStateChange?: (state: CallState) => void;
  config?: Partial<VoiceWidgetConfig>;
  overrides?: Partial<VoiceWidgetConfig>;
  widgetId?: string;
  isDemo?: boolean;
  initialOpen?: boolean;
}

export interface VoiceAgentWidgetRef {
  startCall: () => Promise<void>;
  stopCall: () => void;
  callState: CallState;
}

function parseStatusMessage(content: string): { isStatus: boolean; text: string; statusType: string } {
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        if ('status' in parsed) {
          const statusText = String(parsed.status);
          return {
            isStatus: true,
            text: statusText,
            statusType: statusText.toLowerCase(),
          };
        }
        if ('message' in parsed && ('event' in parsed || 'type' in parsed)) {
          const statusText = String(parsed.message);
          return {
            isStatus: true,
            text: statusText,
            statusType: String(parsed.type || parsed.event || 'default').toLowerCase(),
          };
        }
      }
    }
  } catch (e) {
    // Not valid JSON
  }
  return { isStatus: false, text: content, statusType: '' };
}

const VoiceAgentWidget = forwardRef<VoiceAgentWidgetRef, VoiceAgentWidgetProps>(
  ({ onCallStateChange, config: clientConfig, overrides, widgetId, isDemo = false, initialOpen = false }, ref) => {
    // 1. Deep merge configurations
    const mergedConfig = React.useMemo(() => {
      const step1 = deepMerge(defaultVoiceWidgetConfig, clientConfig);
      return deepMerge(step1, overrides);
    }, [clientConfig, overrides]);

    const isFloating = mergedConfig.mode === 'floating';

    // 2. State management with session persistence (hydration-safe)
    const [isOpen, setIsOpen] = useState(Boolean(initialOpen));

    useEffect(() => {
      if (initialOpen) {
        setIsOpen(true);
        return;
      }
      if (typeof window !== 'undefined') {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('open') === '1' || Boolean(sp.get('widget_resume'))) {
          setIsOpen(true);
          return;
        }
        try {
          const wasOpen = sessionStorage.getItem(`myfrontdesk_open_${widgetId || 'default'}`);
          if (wasOpen === '1') {
            setIsOpen(true);
          }
        } catch (_) {}
      }
    }, [initialOpen, widgetId]);

    // Save isOpen state to sessionStorage whenever it changes
    useEffect(() => {
      if (typeof window === 'undefined') return;
      try {
        sessionStorage.setItem(`myfrontdesk_open_${widgetId || 'default'}`, isOpen ? '1' : '0');
      } catch (_) {}
    }, [isOpen, widgetId]);

    const [callState, setCallState] = useState<CallState>('idle');
    const [isMuted, setIsMuted] = useState(false);
    const [agentSpeaking, setAgentSpeaking] = useState(false);
    const [userSpeaking, setUserSpeaking] = useState(false);
    const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
    const [duration, setDuration] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Text chat states
    const [activeTab, setActiveTab] = useState<'voice' | 'text'>(mergedConfig.behavior.defaultTab);
    const [chatId, setChatId] = useState<string | null>(null);
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChatMessages] = useState<TranscriptMessage[]>([]);
    const [chatTyping, setChatTyping] = useState(false);

    // Synchronize defaultTab state when configuration changes
    useEffect(() => {
      setActiveTab(mergedConfig.behavior.defaultTab);
    }, [mergedConfig.behavior.defaultTab]);

    // Restore cached chat messages on initial mount across host page navigation
    useEffect(() => {
      if (typeof window === 'undefined') return;
      const key = `myfrontdesk_chat_${widgetId || 'default'}`;
      try {
        const saved = sessionStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          const ageMs = Date.now() - (parsed.timestamp || 0);
          // If session is recent (< 30 min), restore messages seamlessly
          if (Array.isArray(parsed.messages) && parsed.messages.length > 0 && ageMs < 30 * 60 * 1000) {
            setChatMessages(parsed.messages);
            if (parsed.chatId) setChatId(parsed.chatId);
            if (parsed.activeTab) setActiveTab(parsed.activeTab);
            return;
          }
        }
      } catch (_) {}

      // Default fresh welcome message
      setChatMessages([{ role: 'agent', content: mergedConfig.branding.welcomeMessage || "Hi! How can I help you today?" }]);
    }, [widgetId, mergedConfig.branding.welcomeMessage]);

    // Save chat messages to sessionStorage on every update
    useEffect(() => {
      if (typeof window === 'undefined' || chatMessages.length === 0) return;
      const key = `myfrontdesk_chat_${widgetId || 'default'}`;
      try {
        sessionStorage.setItem(key, JSON.stringify({
          messages: chatMessages.slice(-30),
          chatId,
          activeTab,
          timestamp: Date.now()
        }));
      } catch (_) {}
    }, [chatMessages, chatId, activeTab, widgetId]);

    // Dynamically load Google Font if custom web font is selected in typography
    useEffect(() => {
      const family = mergedConfig.typography?.fontFamily;
      if (!family || typeof document === 'undefined') return;

      const cleanName = family.replace(/['",]/g, ' ').trim().split(/\s+/)[0];
      const standardFonts = ['system-ui', 'sans-serif', 'serif', 'monospace', 'inherit', 'Arial', 'Helvetica', 'Times'];
      if (!cleanName || standardFonts.includes(cleanName)) return;

      const linkId = `google-font-${cleanName.toLowerCase()}`;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleanName)}:wght@300;400;500;600;700&display=swap`;
        document.head.appendChild(link);
      }
    }, [mergedConfig.typography?.fontFamily]);

    // Pre-warm Retell SDK when panel mounts to eliminate call startup lag
    const retellSdkClassRef = useRef<any>(null);
    useEffect(() => {
      import('retell-client-js-sdk')
        .then((mod) => {
          retellSdkClassRef.current = mod.RetellWebClient;
        })
        .catch(() => {});
    }, []);

    // Cache for voice transcript results to avoid redundant network calls
    const [voiceResults, setVoiceResults] = useState<Record<string, any[]>>({});
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const fetchedContents = useRef<Set<string>>(new Set());

    // Helper to identify greetings vs substantive catalog queries
    const isGreetingOrGeneric = useCallback((text: string) => {
      const t = text.trim().toLowerCase();
      return (
        /^(?:hi|hello|hey|greetings|good\s*(?:morning|afternoon|evening)|welcome)\b/i.test(t) ||
        t.includes('how can i help') ||
        t.includes('how may i assist') ||
        t.includes('front desk receptionist') ||
        t.includes('virtual receptionist') ||
        t.includes('how are you') ||
        t.length < 15
      );
    }, []);

    const lastNavigatedUrlRef = useRef<string | null>(null);
    const lastPendingNavUrlRef = useRef<string | null>(null); // tracks URL from "Would you like me to open?" prompts

    // ── Real-Time Voice Navigation & Entity Cards Bridge ───
    useEffect(() => {
      const isCallActive = ['connected', 'agent_speaking', 'user_listening', 'muted'].includes(callState);
      if (!isCallActive) {
        setVoiceResults({});
        fetchedContents.current.clear();
        lastNavigatedUrlRef.current = null;
        return;
      }

      if (transcript.length === 0) return;

      const latestMessages = transcript.slice(-4);

      for (const msg of latestMessages) {
        const content = msg.content?.trim();
        if (!content) continue;
        const textLower = content.toLowerCase();

        // 1. Real-time Spoken Navigation Listener
        if (mergedConfig.behavior.allowAgentNavigation) {
          // Check for embedded URLs in speech (e.g. "https://...", "/about", "/contact-us", "/services", etc.)
          const urlMatch = content.match(/https?:\/\/[^\s<>"')]+|\/[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*\/?/i);
          let targetUrl = urlMatch ? urlMatch[0] : null;

          if (targetUrl && lastNavigatedUrlRef.current !== targetUrl) {
            lastNavigatedUrlRef.current = targetUrl;
            console.log('[Voice Navigation] Real-time voice navigation triggered for:', targetUrl);
            
            // Broadcast navigation to parent frame / host window
            if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'voice-agent-navigate', url: targetUrl }, '*');
              window.parent.postMessage({ type: 'WIDGET_NAVIGATE', url: targetUrl }, '*');
            } else if (typeof window !== 'undefined') {
              try { window.location.href = targetUrl; } catch {}
            }
          }
        }

        // 2. Real-time Voice Result Cards (Pictures, Ratings, Prices)
        if (!fetchedContents.current.has(content) && !isGreetingOrGeneric(content)) {
          fetchedContents.current.add(content);

          // If query is generic like "show me pictures", build search string from recent context
          let searchQuery = content;
          if (/\b(?:picture|pictures|photo|photos|image|images|show|see|look)\b/i.test(content) && content.length < 35) {
            const recentText = latestMessages.map(m => m.content).join(' ');
            searchQuery = `${content} ${recentText}`;
          }

            // Query entity search for cards
            fetch(`/api/widgets/${widgetId || 'default'}/entities/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: searchQuery, limit: 3 }),
            })
              .then((res) => res.json())
              .then((data) => {
                const results = data.entities || data.results || [];
                if (Array.isArray(results) && results.length > 0) {
                  setVoiceResults((prev) => ({
                    ...prev,
                    [content]: results,
                  }));
                }
              })
              .catch((err) => {
                console.warn('[voice-agent] Failed to search website records for:', content, err);
              });
        }
      }
    }, [transcript, callState, widgetId, mergedConfig.behavior.allowAgentNavigation]);

    const enrichedTranscript = React.useMemo(() => {
      return transcript.map((msg) => {
        const content = msg.content?.trim();
        const results = voiceResults[content] || undefined;
        return { ...msg, results };
      });
    }, [transcript, voiceResults]);

    // Refs
    const clientRef = useRef<any>(null);
    const providerRef = useRef<'retell' | 'vapi'>('retell');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const callIdRef = useRef<string | null>(null);
    const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasUserSpokenRef = useRef(false);
    const isStartingRef = useRef(false);
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const localMediaStreamRef = useRef<MediaStream | null>(null);
    const audioMonitorRef = useRef<AudioLevelMonitor | null>(null);
    const chatMessagesRef = useRef(chatMessages);
    chatMessagesRef.current = chatMessages;
    const transcriptRef = useRef(transcript);
    transcriptRef.current = transcript;

    // Safe stop helper to tear down active call, streams, analyser, and timers
    const safeStopCurrentCall = useCallback(() => {
      if (initialSilenceTimerRef.current) {
        clearTimeout(initialSilenceTimerRef.current);
        initialSilenceTimerRef.current = null;
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      if (audioMonitorRef.current) {
        try {
          audioMonitorRef.current.cleanup();
        } catch {}
        audioMonitorRef.current = null;
      }
      if (localMediaStreamRef.current) {
        stopMediaStream(localMediaStreamRef.current);
        localMediaStreamRef.current = null;
      }
      if (clientRef.current) {
        try {
          if (providerRef.current === 'vapi') {
            clientRef.current.stop();
          } else {
            clientRef.current.stopCall();
          }
        } catch (err) {
          console.warn('[VoiceAgent] Error stopping client:', err);
        }
        clientRef.current = null;
      }
      isStartingRef.current = false;
      setAgentSpeaking(false);
      setUserSpeaking(false);
    }, []);

    // Handle microphone device changes dynamically during active calls
    useEffect(() => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return;
      const handleDeviceChange = async () => {
        console.log('[VoiceAgentWidget] Audio input device change detected.');
        if (['connected', 'agent_speaking', 'user_listening'].includes(callState)) {
          if (providerRef.current === 'retell' && clientRef.current) {
            await verifyRetellMicrophoneAttachment(clientRef.current).catch(() => {});
          } else if (providerRef.current === 'vapi' && clientRef.current) {
            await verifyVapiMicrophoneAttachment(clientRef.current).catch(() => {});
          }
        }
      };
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }, [callState]);

    // Initial silence watchdog speech activity detector (Task C.2)
    const notifySpeechActivity = useCallback(() => {
      if (!hasUserSpokenRef.current) {
        hasUserSpokenRef.current = true;
        if (initialSilenceTimerRef.current) {
          clearTimeout(initialSilenceTimerRef.current);
          initialSilenceTimerRef.current = null;
        }
        if (callIdRef.current && sessionIdRef.current) {
          fetch('/api/retell/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionIdRef.current,
              callId: callIdRef.current,
              event: 'user_speech_detected',
            }),
          }).catch(() => {});
        }
      }
    }, []);

    // Demo/mock simulation refs and cleanup helper
    const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearDemoSimulation = useCallback(() => {
      demoTimersRef.current.forEach(clearTimeout);
      demoTimersRef.current = [];
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
    }, []);

    // Clean up call on unmount (including demo timers & silence watchdogs)
    useEffect(() => {
      return () => {
        demoTimersRef.current.forEach(clearTimeout);
        if (demoIntervalRef.current) {
          clearInterval(demoIntervalRef.current);
        }
        if (initialSilenceTimerRef.current) {
          clearTimeout(initialSilenceTimerRef.current);
        }
      };
    }, []);

    // ── Phase 9.4: Resume Conversation on Load if widget_resume Param Present ─
    useEffect(() => {
      if (typeof window === 'undefined') return;

      const urlParams = new URLSearchParams(window.location.search);
      const resumeToken = urlParams.get('widget_resume');

      if (resumeToken) {
        sessionIdRef.current = resumeToken;
        setActiveSessionId(resumeToken);
        setIsOpen(true);

        // 1. Try local storage cache
        try {
          const cached =
            sessionStorage.getItem(`widget_session_${resumeToken}`) ||
            localStorage.getItem(`widget_session_${resumeToken}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.chatMessages && Array.isArray(parsed.chatMessages) && parsed.chatMessages.length > 0) {
              setChatMessages(parsed.chatMessages);
            }
            if (parsed.transcript && Array.isArray(parsed.transcript) && parsed.transcript.length > 0) {
              setTranscript(parsed.transcript);
            }
          }
        } catch {}

        // 2. Fetch from backend session history API
        fetch(`/api/session/${encodeURIComponent(resumeToken)}/history`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.found) {
              if (Array.isArray(data.messages) && data.messages.length > 0) {
                setChatMessages(data.messages);
              }
              if (Array.isArray(data.transcript) && data.transcript.length > 0) {
                setTranscript(data.transcript);
              }
            }
          })
          .catch(() => {});
      }
    }, []);

    // ── Phase 9.4: Auto-persist conversation history for session resumption ─
    useEffect(() => {
      const sid = activeSessionId || sessionIdRef.current;
      if (!sid || (chatMessages.length <= 1 && transcript.length === 0)) return;

      const sessionData = {
        sessionId: sid,
        chatMessages,
        transcript,
        updatedAt: Date.now(),
      };

      try {
        sessionStorage.setItem(`widget_session_${sid}`, JSON.stringify(sessionData));
        localStorage.setItem(`widget_session_${sid}`, JSON.stringify(sessionData));
      } catch {}

      // Async sync to backend history endpoint
      fetch(`/api/session/${encodeURIComponent(sid)}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      }).catch(() => {});
    }, [chatMessages, transcript, activeSessionId]);

    // ── Phase 9.2 & 9.4: Realtime Session Channel Subscription & Navigation Bridge ───
    const isSessionActive =
      ['connecting', 'connected', 'agent_speaking', 'user_listening', 'muted'].includes(callState) ||
      (isOpen && activeTab === 'text' && Boolean(activeSessionId || sessionIdRef.current));

    useEffect(() => {
      const targetSessionId = activeSessionId || sessionIdRef.current;

      if (!targetSessionId || !isSessionActive) {
        return;
      }

      const unsubscribe = subscribeToSessionChannel(targetSessionId, (event: string, payload: any) => {
        if (event === 'navigate') {
          // Phase 9.1 toggle check:
          if (mergedConfig.behavior.allowAgentNavigation) {
            const targetUrl = payload?.url;
            if (targetUrl) {
              // Persist current session transcript before navigation
              try {
                const sessionData = {
                  sessionId: targetSessionId,
                  chatMessages: chatMessagesRef.current,
                  transcript: transcriptRef.current,
                  updatedAt: Date.now(),
                };
                sessionStorage.setItem(`widget_session_${targetSessionId}`, JSON.stringify(sessionData));
                localStorage.setItem(`widget_session_${targetSessionId}`, JSON.stringify(sessionData));
              } catch {}

              // Phase 9.4: PostMessage to parent frame (loader) for host page navigation
              if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'voice-agent-navigate', url: targetUrl, payload }, '*');
                window.parent.postMessage({ type: 'WIDGET_NAVIGATE', url: targetUrl, payload }, '*');
              } else if (typeof window !== 'undefined') {
                // Direct navigation if standalone (non-iframe)
                try {
                  window.location.href = targetUrl;
                } catch {}
              }
            }
          } else {
            console.log('[Widget Navigation] Agent requested navigation, but allowAgentNavigation is disabled in widget settings.');
          }
        } else if (event === 'ui_action') {
          if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'WIDGET_UI_ACTION', action: payload?.action, payload }, '*');
          }
        }
      });

      return () => {
        unsubscribe();
      };
    }, [activeSessionId, isSessionActive, isOpen, activeTab, mergedConfig.behavior.allowAgentNavigation]);

    // Iframe postMessage communications
    useEffect(() => {
      if (typeof window !== 'undefined' && window !== window.parent) {
        window.parent.postMessage({ type: isOpen ? 'widget-open' : 'widget-close' }, '*');
      }
    }, [isOpen]);

    useEffect(() => {
      if (typeof window !== 'undefined' && window !== window.parent) {
        window.parent.postMessage({ type: 'widget-ready', config: mergedConfig }, '*');
      }
    }, [mergedConfig]);

    // Sync state update with parent callback
    const updateState = useCallback(
      (newState: CallState) => {
        setCallState(newState);
        if (onCallStateChange) {
          onCallStateChange(newState);
        }
      },
      [onCallStateChange]
    );

    // Telemetry logger
    const sendTelemetry = useCallback(
      async (event: 'call_start' | 'call_end' | 'call_error', errorDetails?: string) => {
        if (!mergedConfig.behavior.telemetryEnabled) return;
        if (!sessionIdRef.current) return;
        try {
          await fetch('/api/retell/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionIdRef.current,
              callId: callIdRef.current || 'vapi-session',
              event,
              ...(errorDetails ? { errorDetails } : {}),
            }),
          });
        } catch {
          console.warn('[telemetry] Logging event failed:', event);
        }
      },
      [mergedConfig.behavior.telemetryEnabled]
    );

    const isCallActive = ['connected', 'agent_speaking', 'user_listening', 'muted'].includes(callState);

    // Call duration timer effect
    useEffect(() => {
      if (isCallActive) {
        if (!timerRef.current) {
          setDuration(0);
          timerRef.current = setInterval(() => {
            setDuration((prev) => prev + 1);
          }, 1000);
        }
      } else {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    }, [isCallActive]);

    // Auto-scroll chat & transcripts
    useEffect(() => {
      if (transcriptEndRef.current) {
        transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, [chatMessages, transcript, chatTyping]);

    const sendChatMessage = useCallback(
      async (overrideText?: string) => {
        const text = (typeof overrideText === 'string' ? overrideText : chatInput).trim();
        const isVoiceOperating = ['connecting', 'permission_required', 'connected', 'agent_speaking', 'user_listening', 'muted', 'ending'].includes(callState);
        if (!text || chatTyping || isVoiceOperating) return;

        setChatInput('');
        const userMsg: TranscriptMessage = { role: 'user', content: text };
        setChatMessages((prev) => [...prev, userMsg]);
        setChatTyping(true);

        try {
          const res = await fetch('/api/retell/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatId,
              content: text,
              widgetId: widgetId || 'default',
              history: chatMessages.slice(-8),
              lastNavUrl: lastPendingNavUrlRef.current,
            }),
          });

          if (!res.ok) {
            throw new Error('Failed to get response');
          }

          const data = await res.json();
          if (data.chatId) {
            setChatId(data.chatId);
          }
          if (data.sessionId) {
            sessionIdRef.current = data.sessionId;
            setActiveSessionId(data.sessionId);
          }

          // ── Handle navigation: check pending "yes" confirmation first ──
          const isYesConfirmation = /^(?:yes|yeah|sure|yep|ok|okay|open it|open that|go|navigate|do it|please|let's go|yes please)[\.!]*$/i.test(text.trim());
          let navUrl = data.navigationUrl || data.action?.url;

          // If user said "yes" and there's a pending nav URL from a previous agent message, use it
          if (!navUrl && isYesConfirmation && lastPendingNavUrlRef.current) {
            navUrl = lastPendingNavUrlRef.current;
          }

          if (data.messages && Array.isArray(data.messages)) {
            // Filter only agent messages to prevent duplicating the user's message in the UI
            const agentMsgs = data.messages
              .filter((m: any) => m.role === 'agent')
              .map((m: any) => ({
                role: 'agent' as const,
                content: m.content,
                ...(m.results && Array.isArray(m.results) && m.results.length > 0
                  ? { results: m.results }
                  : {}),
              })) as TranscriptMessage[];

            if (agentMsgs.length > 0) {
              // ── Search entity cards for the agent's reply and attach to message ──
              const agentContent = agentMsgs[0]?.content || '';
              const shouldSearchCards = !isGreetingOrGeneric(agentContent) && !isGreetingOrGeneric(text);

              if (shouldSearchCards && !agentMsgs[0].results) {
                // Fire async entity search and update the message when done
                const searchQuery = text.length > agentContent.length ? text : agentContent;
                fetch(`/api/widgets/${widgetId || 'default'}/entities/search`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query: searchQuery, limit: 4 }),
                })
                  .then((r) => r.json())
                  .then((entityData) => {
                    const entityResults = entityData.entities || entityData.results || [];
                    if (Array.isArray(entityResults) && entityResults.length > 0) {
                      setChatMessages((prev) => {
                        const idx = prev.findIndex((m) => m.role === 'agent' && m.content === agentContent && !m.results);
                        if (idx === -1) return prev;
                        const updated = [...prev];
                        updated[idx] = { ...updated[idx], results: entityResults };
                        return updated;
                      });
                    }
                  })
                  .catch(() => {});
              }

              setChatMessages((prev) => [...prev, ...agentMsgs]);

              // Track the pending navigation URL from agent suggestions or markdown links
              const urlFromMarkdown = agentContent.match(/\[(?:[^\]]+)\]\((https?:\/\/[^\)]+|\/[^\)]+)\)/)?.[1];
              const urlFromText = agentContent.match(/https?:\/\/[^\s<>"')]+/)?.[0];
              const suggestedNavUrl = data.suggestedUrl || data.navigationUrl || data.action?.url || 
                (data.messages.find((m: any) => m.navigationUrl || m.action?.url || m.suggestedUrl) as any)?.suggestedUrl ||
                urlFromMarkdown || urlFromText || agentMsgs[0]?.results?.[0]?.sourceUrl;

              if (suggestedNavUrl) {
                lastPendingNavUrlRef.current = suggestedNavUrl;
              }
            }
          }

          // ── Real-Time Autonomous Host Navigation ──
          if (navUrl && typeof window !== 'undefined') {
            lastPendingNavUrlRef.current = null; // consumed
            try {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'WIDGET_NAVIGATE', url: navUrl }, '*');
                window.parent.postMessage({ type: 'voice-agent-navigate', url: navUrl }, '*');
              } else if (window.location.pathname !== new URL(navUrl, window.location.href).pathname) {
                window.location.href = navUrl;
              }
            } catch (navErr) {
              console.warn('[VoiceAgent] Navigation error:', navErr);
            }
          }
        } catch {
          setChatMessages((prev) => [
            ...prev,
            { role: 'agent', content: 'Sorry, I encountered an issue connecting to the chat service. Please try again.' },
          ]);
        } finally {
          setChatTyping(false);
        }
      },
      [chatInput, chatTyping, chatId, isDemo, mergedConfig.branding.companyName, widgetId, chatMessages, isGreetingOrGeneric]
    );

    const handleSendChatMessage = useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        sendChatMessage();
      },
      [sendChatMessage]
    );

    const handleNewChat = useCallback(() => {
      // 1. Generate new session ID
      const newSid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `session_${Date.now()}`;
      sessionIdRef.current = newSid;
      setActiveSessionId(newSid);
      setChatId(null);

      // 2. Clear stored previous session caches
      if (typeof window !== 'undefined') {
        try {
          const keysToClear: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && (k.startsWith('widget_session_') || k.startsWith('myfrontdesk_chat_') || k.startsWith('myfrontdesk_reopen_'))) {
              keysToClear.push(k);
            }
          }
          keysToClear.forEach((k) => sessionStorage.removeItem(k));
          if (activeSessionId) {
            localStorage.removeItem(`widget_session_${activeSessionId}`);
          }
        } catch (_) {}

        if (window.parent && window.parent !== window) {
          try {
            window.parent.postMessage({ type: 'widget-new-chat', widgetId }, '*');
          } catch (_) {}
        }
      }

      // 3. Reset chat to initial welcome message
      const initialMsg = {
        role: 'agent' as const,
        content: mergedConfig.branding.welcomeMessage || "Hi! I'm your AutoMate dealership assistant. How can I help you today?",
      };
      setChatMessages([initialMsg]);
      setTranscript([]);
      setVoiceResults({});
      setDismissedCardTopic(null);
      setErrorMessage(null);
      setChatInput('');
      setChatTyping(false);
    }, [mergedConfig, activeSessionId, widgetId]);

    const [dismissedCardTopic, setDismissedCardTopic] = useState<string | null>(null);
    const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);

    const activeCards = React.useMemo(() => {
      if (activeTab === 'text') {
        for (let i = chatMessages.length - 1; i >= 0; i--) {
          const msg = chatMessages[i];
          if (msg.role === 'agent' && msg.results && msg.results.length > 0) {
            if (dismissedCardTopic === msg.content) return [];
            return msg.results;
          }
        }
      } else {
        for (let i = transcript.length - 1; i >= 0; i--) {
          const content = transcript[i].content;
          if (content && voiceResults[content] && voiceResults[content].length > 0) {
            if (dismissedCardTopic === content) return [];
            return voiceResults[content];
          }
        }
      }
      return [];
    }, [activeTab, chatMessages, transcript, voiceResults, dismissedCardTopic]);

    // Send resize postMessage whenever cards expand or collapse or manual toggle changes
    useEffect(() => {
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'widget-resize',
          expanded: activeCards.length > 0 || isManuallyExpanded,
        }, '*');
      }
    }, [activeCards.length, isManuallyExpanded]);

    const startCall = useCallback(async () => {
      if (callState !== 'idle' && callState !== 'ended' && callState !== 'error') {
        return;
      }
      if (isStartingRef.current) return;
      isStartingRef.current = true;

      hasUserSpokenRef.current = false;
      if (initialSilenceTimerRef.current) {
        clearTimeout(initialSilenceTimerRef.current);
        initialSilenceTimerRef.current = null;
      }

      setActiveTab('voice');
      updateState('connecting');
      setErrorMessage(null);
      setTranscript([]);
      setIsMuted(false);
      setAgentSpeaking(false);
      setUserSpeaking(false);

      if (isDemo) {
        clearDemoSimulation();
        // --- Demo/Mock Call Flow ---
        const t1 = setTimeout(() => {
          updateState('connected');
          setTranscript([{ role: 'agent', content: mergedConfig.branding.welcomeMessage || "Hi! How can I help you today?" }]);
          setAgentSpeaking(true);
          setCallState('agent_speaking');
          
          const t2 = setTimeout(() => {
            setAgentSpeaking(false);
            setCallState('user_listening');
            isStartingRef.current = false;
            
            // Set up recurring simulation conversation
            let step = 0;
            const interval = setInterval(() => {
              if (step === 0) {
                // User talks
                setUserSpeaking(true);
                setCallState('user_listening');
                const tInner = setTimeout(() => {
                  setTranscript(prev => [...prev, { role: 'user', content: 'I would like to test the front desk agent.' }]);
                  setUserSpeaking(false);
                }, 2000);
                demoTimersRef.current.push(tInner);
                step = 1;
              } else {
                // Agent talks
                setAgentSpeaking(true);
                setCallState('agent_speaking');
                const tInner = setTimeout(() => {
                  setTranscript(prev => [...prev, { role: 'agent', content: 'I am responding to your test! The visual layout is updating in real time.' }]);
                  setAgentSpeaking(false);
                  setCallState('user_listening');
                }, 2000);
                demoTimersRef.current.push(tInner);
                step = 0;
              }
            }, 6000);
            demoIntervalRef.current = interval;
          }, 3000);
          demoTimersRef.current.push(t2);
        }, 1500);
        demoTimersRef.current.push(t1);
        return;
      }

      let activeClient: any = null;

      try {
        safeStopCurrentCall();

        // 1. Pre-flight check and prompt microphone permission (releases probe tracks immediately)
        await preflightMicrophoneAccess();

        updateState('connecting');

        // Determine call endpoint + body from config.
        // widgetId = hosted multi-tenant (goes through /api/widgets/create-call)
        // config.provider = inline usage (goes through provider-specific endpoint)
        const configProvider = mergedConfig.provider?.provider ?? 'retell';
        const configAgentId = mergedConfig.provider?.agentId ?? '';

        let callEndpoint: string;
        let callBody: Record<string, unknown>;

        if (widgetId) {
          // Multi-tenant hosted widget path
          callEndpoint = '/api/widgets/create-call';
          callBody = { widgetId };
        } else if (configProvider === 'vapi') {
          // Inline Vapi path
          callEndpoint = '/api/vapi/create-call';
          callBody = { agentId: configAgentId };
        } else {
          // Default: Retell
          callEndpoint = '/api/retell/create-web-call';
          callBody = configAgentId ? { agentId: configAgentId } : {};
        }

        const res = await fetch(callEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(callBody),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'The voice receptionist service is currently unavailable. Please try again.');
        }

        const data = await res.json();
        
        // ─── Provider: Retell ───────────────────────────────────────────────
        if (!data.provider || data.provider === 'retell') {
          providerRef.current = 'retell';
          if (!data.accessToken || !data.callId || !data.sessionId) {
            throw new Error('Failed to establish a Retell call session with our servers.');
          }

          const token = data.accessToken;
          sessionIdRef.current = data.sessionId;
          setActiveSessionId(data.sessionId);
          callIdRef.current = data.callId;

          const RetellWebClient = retellSdkClassRef.current || (await import('retell-client-js-sdk')).RetellWebClient;
          activeClient = new RetellWebClient();
          clientRef.current = activeClient;

          const initialSilenceSec = Number(data.initialSilenceTimeoutSeconds || mergedConfig.behavior.initialSilenceTimeoutSeconds || 60);

          activeClient.on('call_started', async () => {
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }

            // Explicitly verify Retell audio playback & track publishing
            await verifyRetellMicrophoneAttachment(activeClient).catch((err) => {
              console.warn('[VoiceAgentWidget] Retell microphone attachment check warning:', err);
            });

            // Listen for local audio track publication and attach real-time volume monitor
            const attachTrackMonitor = (trackPub: any) => {
              const mediaTrack = trackPub?.track?.mediaStreamTrack;
              if (mediaTrack) {
                mediaTrack.enabled = true;
                console.log(`[VoiceAgentWidget] Microphone track active: "${mediaTrack.label}" (transmitting: ${mediaTrack.enabled}, hardwareState: ${mediaTrack.muted ? 'waiting_first_frame' : 'streaming'})`);
                if (mediaTrack.muted) {
                  mediaTrack.addEventListener('unmute', () => {
                    console.log('[VoiceAgentWidget] Hardware audio stream established — microphone transmitting.');
                  }, { once: true });
                }
                const stream = new MediaStream([mediaTrack]);
                localMediaStreamRef.current = stream;
                if (audioMonitorRef.current) {
                  audioMonitorRef.current.cleanup();
                }
                audioMonitorRef.current = createAudioLevelMonitor(stream, {
                  onSpeechDetected: () => {
                    notifySpeechActivity();
                  },
                });
              }
            };

            const existingPub = activeClient.room?.localParticipant?.getTrackPublication?.('microphone');
            if (existingPub) {
              attachTrackMonitor(existingPub);
            } else if (activeClient.room) {
              activeClient.room.on('localTrackPublished', (pub: any) => {
                if (pub?.source === 'microphone' || pub?.kind === 'audio') {
                  attachTrackMonitor(pub);
                }
              });
            }

            updateState('connected');
            sendTelemetry('call_start');

            // Start initial silence watchdog (e.g. 15s) to save call costs on inactive connections
            if (initialSilenceTimerRef.current) clearTimeout(initialSilenceTimerRef.current);
            if (initialSilenceSec > 0) {
              initialSilenceTimerRef.current = setTimeout(() => {
                if (!hasUserSpokenRef.current && clientRef.current === activeClient) {
                  console.warn(`[SILENCE_AUTO_HANGUP] No user speech detected within ${initialSilenceSec}s. Terminating call to prevent idle usage.`);
                  safeStopCurrentCall();
                  setErrorMessage('Call ended due to inactivity.');
                  sendTelemetry('call_end', 'initial_silence_timeout');
                }
              }, initialSilenceSec * 1000);
            }
          });

          activeClient.on('call_ended', () => {
            if (initialSilenceTimerRef.current) {
              clearTimeout(initialSilenceTimerRef.current);
              initialSilenceTimerRef.current = null;
            }
            updateState('ended');
            sendTelemetry('call_end');
            setAgentSpeaking(false);
            setUserSpeaking(false);
            isStartingRef.current = false;
            setActiveSessionId(null);
            if (clientRef.current === activeClient) {
              clientRef.current = null;
            }
          });

          activeClient.on('agent_start_talking', () => {
            setAgentSpeaking(true);
            setCallState((prev) => (prev === 'muted' ? 'muted' : 'agent_speaking'));
          });

          activeClient.on('agent_stop_talking', () => {
            setAgentSpeaking(false);
            setCallState((prev) => (prev === 'muted' ? 'muted' : 'user_listening'));
          });

          activeClient.on('user_start_talking', () => {
            notifySpeechActivity();
            setUserSpeaking(true);
            setCallState((prev) => (prev === 'muted' ? 'muted' : 'user_listening'));
          });

          activeClient.on('user_stop_talking', () => {
            setUserSpeaking(false);
            setCallState((prev) => (prev === 'muted' ? 'muted' : 'user_listening'));
          });

          activeClient.on('update', (update: { transcript?: TranscriptMessage[] }) => {
            if (update && update.transcript) {
              setTranscript(update.transcript);
              if (update.transcript.some((m) => m.role === 'user' && m.content?.trim())) {
                notifySpeechActivity();
              }
            }
          });

          activeClient.on('error', (err: { message?: string }) => {
            const errMsg = err?.message || 'Call encountered a connection interruption.';
            // Ignore normal disconnect or data channel teardown logs
            if (errMsg.includes('participant') || errMsg.includes('closed') || errMsg.includes('DataChannel') || errMsg.includes('unsubscribed')) {
              console.warn('[VoiceAgent] WebRTC channel event:', errMsg);
              return;
            }
            console.error('Retell SDK error:', err);
            sendTelemetry('call_error', errMsg);
            setErrorMessage(errMsg);
            updateState('error');
            setAgentSpeaking(false);
            setUserSpeaking(false);
            isStartingRef.current = false;
            if (clientRef.current === activeClient) {
              clientRef.current = null;
            }
          });

          connectionTimeoutRef.current = setTimeout(() => {
            console.warn('Call connection timed out.');
            if (activeClient) {
              try {
                activeClient.stopCall();
              } catch {}
            }
            if (clientRef.current === activeClient) {
              clientRef.current = null;
            }
            sendTelemetry('call_error', 'connection_timeout');
            setErrorMessage('Unable to connect right now. Please check your internet connection and try again.');
            updateState('error');
            isStartingRef.current = false;
          }, mergedConfig.behavior.connectionTimeout);

          try {
            await activeClient.startCall({
              accessToken: token,
              emitRawAudioSamples: false,
            });
          } catch (callStartErr: any) {
            console.error('[VoiceAgentWidget] Retell startCall failed:', callStartErr);
            const msg = callStartErr?.name === 'NotAllowedError' || callStartErr?.message?.includes('Permission')
              ? 'Microphone permission was denied. Please allow microphone access in your browser.'
              : (callStartErr?.message || 'Unable to connect the voice call.');
            setErrorMessage(msg);
            updateState('error');
            isStartingRef.current = false;
            return;
          }
        }
        
        // ─── Provider: Vapi ─────────────────────────────────────────────────
        else if (data.provider === 'vapi') {
          providerRef.current = 'vapi';
          if (!data.vapiPublicApiKey || !data.vapiAssistantId || !data.sessionId) {
            throw new Error('Failed to retrieve Vapi Web SDK initialization parameters.');
          }

          sessionIdRef.current = data.sessionId;
          setActiveSessionId(data.sessionId);
          callIdRef.current = 'vapi-call';

          const VapiSdk = (await import('@vapi-ai/web')).default;
          activeClient = new VapiSdk(data.vapiPublicApiKey);
          clientRef.current = activeClient;

          let agentSpeakingTimeout: NodeJS.Timeout | null = null;

          const initialSilenceSec = Number(data.initialSilenceTimeoutSeconds || mergedConfig.behavior.initialSilenceTimeoutSeconds || 60);

          activeClient.on('call-start', async () => {
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }

            // Explicitly verify Vapi unmute state
            await verifyVapiMicrophoneAttachment(activeClient).catch((err) => {
              console.warn('[VoiceAgentWidget] Vapi microphone attachment check warning:', err);
            });

            updateState('connected');
            sendTelemetry('call_start');

            // Start initial silence watchdog (Task C.2)
            if (initialSilenceTimerRef.current) clearTimeout(initialSilenceTimerRef.current);
            initialSilenceTimerRef.current = setTimeout(() => {
              if (!hasUserSpokenRef.current && clientRef.current === activeClient) {
                console.warn(`[SILENCE_AUTO_HANGUP] No user speech detected within ${initialSilenceSec}s. Terminating call.`);
                safeStopCurrentCall();
                setErrorMessage('Call ended due to inactivity.');
                sendTelemetry('call_end', 'initial_silence_timeout');
              }
            }, initialSilenceSec * 1000);
          });

          activeClient.on('call-end', () => {
            if (initialSilenceTimerRef.current) {
              clearTimeout(initialSilenceTimerRef.current);
              initialSilenceTimerRef.current = null;
            }
            if (agentSpeakingTimeout) {
              clearTimeout(agentSpeakingTimeout);
              agentSpeakingTimeout = null;
            }
            updateState('ended');
            sendTelemetry('call_end');
            setAgentSpeaking(false);
            setUserSpeaking(false);
            isStartingRef.current = false;
            setActiveSessionId(null);
            if (clientRef.current === activeClient) {
              clientRef.current = null;
            }
          });

          activeClient.on('message', (message: any) => {
            if (message.type === 'transcript') {
              const role = message.role === 'assistant' ? 'agent' : 'user';
              const content = message.transcript;
              if (role === 'user' && content?.trim()) {
                notifySpeechActivity();
              }
              
              setTranscript((prev) => {
                const filtered = prev.filter((m) => !m.isPartial);
                if (message.transcriptType === 'final') {
                  return [...filtered, { role, content }];
                } else {
                  return [...filtered, { role, content, isPartial: true }];
                }
              });
            }
          });

          activeClient.on('speech-start', () => {
            notifySpeechActivity();
            setUserSpeaking(true);
            setAgentSpeaking(false);
            setCallState((prev) => (prev === 'muted' ? 'muted' : 'user_listening'));
          });

          activeClient.on('speech-end', () => {
            setUserSpeaking(false);
            setCallState((prev) => (prev === 'muted' ? 'muted' : 'user_listening'));
          });

          activeClient.on('local-audio-level', (level: number) => {
            if (level > 0.01) {
              notifySpeechActivity();
            }
          });

          activeClient.on('volume-level', (volume: number) => {
            // Volume is between 0 and 1. Volume > 0.01 indicates assistant is active
            if (volume > 0.01) {
              setAgentSpeaking(true);
              setUserSpeaking(false);
              setCallState((prev) => (prev === 'muted' ? 'muted' : 'agent_speaking'));
              if (agentSpeakingTimeout) {
                clearTimeout(agentSpeakingTimeout);
                agentSpeakingTimeout = null;
              }
            } else {
              if (!agentSpeakingTimeout) {
                agentSpeakingTimeout = setTimeout(() => {
                  setAgentSpeaking(false);
                  setCallState((prev) => (prev === 'muted' || prev === 'user_listening' ? prev : 'user_listening'));
                  agentSpeakingTimeout = null;
                }, 1000);
              }
            }
          });

          activeClient.on('error', (err: any) => {
            console.error('Vapi SDK error:', err);
            if (agentSpeakingTimeout) {
              clearTimeout(agentSpeakingTimeout);
              agentSpeakingTimeout = null;
            }
            const errMsg = err.message || 'Call encountered a connection interruption.';
            sendTelemetry('call_error', errMsg);
            setErrorMessage(errMsg);
            updateState('error');
            setAgentSpeaking(false);
            setUserSpeaking(false);
            isStartingRef.current = false;
            if (clientRef.current === activeClient) {
              clientRef.current = null;
            }
          });

          connectionTimeoutRef.current = setTimeout(() => {
            console.warn('Call connection timed out.');
            if (agentSpeakingTimeout) {
              clearTimeout(agentSpeakingTimeout);
              agentSpeakingTimeout = null;
            }
            if (activeClient) {
              try {
                activeClient.stop();
              } catch {}
            }
            if (clientRef.current === activeClient) {
              clientRef.current = null;
            }
            sendTelemetry('call_error', 'connection_timeout');
            setErrorMessage('Unable to connect right now. Please check your internet connection and try again.');
            updateState('error');
            isStartingRef.current = false;
          }, mergedConfig.behavior.connectionTimeout);

          await activeClient.start(data.vapiAssistantId, data.vapiAssistantOverrides);
        }
      } catch (err) {
        console.error('Error starting voice assistant:', err);
        safeStopCurrentCall();

        const errorMsg = err instanceof Error ? err.message : '';
        const friendlyMsg =
          errorMsg && !errorMsg.includes('fetch') && !errorMsg.includes('HTTP') && !errorMsg.includes('Fetch')
            ? errorMsg
            : 'Unable to start the voice assistant. Please try again.';

        setErrorMessage(friendlyMsg);
        updateState('error');
        isStartingRef.current = false;
      }
    }, [callState, updateState, sendTelemetry, mergedConfig, widgetId, isDemo, clearDemoSimulation, safeStopCurrentCall, notifySpeechActivity]);

    const stopCall = useCallback(() => {
      if (callState === 'idle' || callState === 'ending' || callState === 'ended') {
        return;
      }
      if (isDemo) {
        clearDemoSimulation();
        updateState('ending');
        const t = setTimeout(() => {
          updateState('ended');
          isStartingRef.current = false;
        }, 800);
        demoTimersRef.current.push(t);
        return;
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      updateState('ending');
      safeStopCurrentCall();
    }, [callState, updateState, safeStopCurrentCall, isDemo, clearDemoSimulation]);

    const toggleMute = useCallback(() => {
      if (!['connected', 'agent_speaking', 'user_listening', 'muted'].includes(callState)) {
        return;
      }
      if (!clientRef.current) return;

      const nextMute = !isMuted;
      if (nextMute) {
        if (providerRef.current === 'vapi') {
          clientRef.current.setMuted(true);
        } else {
          clientRef.current.mute();
        }
        setCallState('muted');
      } else {
        if (providerRef.current === 'vapi') {
          clientRef.current.setMuted(false);
        } else {
          clientRef.current.unmute();
        }
        setCallState(agentSpeaking ? 'agent_speaking' : 'user_listening');
      }
      setIsMuted(nextMute);
    }, [callState, isMuted, agentSpeaking]);

    // Expose start/stop call controls to parent
    useImperativeHandle(
      ref,
      () => ({
        startCall,
        stopCall,
        callState,
      }),
      [startCall, stopCall, callState]
    );

    // Clean up call on unmount
    useEffect(() => {
      const handleBeforeUnload = () => {
        safeStopCurrentCall();
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        safeStopCurrentCall();
      };
    }, [safeStopCurrentCall]);

    // Auto-reset call state
    useEffect(() => {
      if (callState === 'ended') {
        const timer = setTimeout(() => {
          updateState('idle');
          setTranscript([]);
        }, mergedConfig.behavior.autoResetEndedTimeout);
        return () => clearTimeout(timer);
      }
    }, [callState, updateState, mergedConfig.behavior.autoResetEndedTimeout]);

    // 3. Build CSS variables mapping from merged config
    const cssVars = React.useMemo(() => {
      const { theme, typography } = mergedConfig;
      const getRadiusValue = (variant: string) => {
        switch (variant) {
          case 'none':
            return '0px';
          case 'sm':
            return '8px';
          case 'md':
            return '12px';
          case 'lg':
            return '16px';
          case 'xl':
            return '20px';
          case '2xl':
            return '24px';
          case 'full':
            return '9999px';
          default:
            return variant;
        }
      };

      const getShadowValue = (variant: string) => {
        switch (variant) {
          case 'none':
            return 'none';
          case 'sm':
            return '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
          case 'md':
            return '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          case 'lg':
            return '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          case 'xl':
            return '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
          case '2xl':
            return '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
          default:
            return variant;
        }
      };

      const getFontSizes = (scale: string) => {
        if (scale === 'sm') {
          return {
            xs: '11px',
            sm: '12px',
            base: '13px',
            lg: '15px',
            xl: '16px',
          };
        } else if (scale === 'lg') {
          return {
            xs: '13px',
            sm: '14px',
            base: '15px',
            lg: '17.5px',
            xl: '20px',
          };
        } else {
          return {
            xs: '12px',
            sm: '13px',
            base: '14px',
            lg: '16px',
            xl: '18px',
          };
        }
      };

      const fontSizes = getFontSizes(typography.fontSizeScale);

      const hexToRgb = (hex: string): string => {
        const clean = hex.replace('#', '');
        if (clean.length === 6) {
          const r = parseInt(clean.substring(0, 2), 16);
          const g = parseInt(clean.substring(2, 4), 16);
          const b = parseInt(clean.substring(4, 6), 16);
          return `${r}, ${g}, ${b}`;
        }
        return '47, 143, 224'; // fallback blue
      };

      const getContrastColor = (hex: string): string => {
        if (!hex || !hex.startsWith('#')) return '#FFFFFF';
        const clean = hex.replace('#', '');
        if (clean.length !== 6) return '#FFFFFF';
        const r = parseInt(clean.substring(0, 2), 16) || 0;
        const g = parseInt(clean.substring(2, 4), 16) || 0;
        const b = parseInt(clean.substring(4, 6), 16) || 0;
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.6 ? '#0E1B2A' : '#FFFFFF';
      };

      const primaryRgb = hexToRgb(theme.primaryColor);

      return {
        '--voice-widget-primary': theme.primaryColor,
        '--voice-widget-primary-hover': theme.primaryHoverColor || theme.primaryColor,
        '--voice-widget-primary-ring': `rgba(${primaryRgb}, 0.4)`,
        '--voice-widget-primary-ring-transparent': `rgba(${primaryRgb}, 0)`,
        '--voice-widget-bg': theme.panelBackground,
        '--voice-widget-bg-panel': theme.panelBackground,
        '--voice-widget-bg-launcher': theme.launcherBackground,
        '--voice-widget-bg-header': theme.headerBackground,
        '--voice-widget-bg-transcript': theme.transcriptBackground,
        '--voice-widget-bg-user-bubble': theme.userMessageBackground,
        '--voice-widget-text-user-bubble': getContrastColor(theme.userMessageBackground),
        '--voice-widget-bg-agent-bubble': theme.agentMessageBackground,
        '--voice-widget-text': theme.primaryTextColor,
        '--voice-widget-text-secondary': theme.secondaryTextColor,
        '--voice-widget-text-muted': theme.mutedTextColor,
        '--voice-widget-border': theme.borderColor,
        '--voice-widget-border-input': theme.inputBorderColor,
        '--voice-widget-success': theme.successColor,
        '--voice-widget-error': theme.errorColor,
        '--voice-widget-warning': theme.warningColor,
        '--voice-widget-connecting': theme.connectingColor,
        '--voice-widget-wave-agent': theme.waveformColor,
        '--voice-widget-wave-user': theme.successColor,
        '--voice-widget-accent': theme.speakingIndicatorColor,
        '--voice-widget-font-family': typography.fontFamily,
        '--voice-widget-font-xs': fontSizes.xs,
        '--voice-widget-font-sm': fontSizes.sm,
        '--voice-widget-font-base': fontSizes.base,
        '--voice-widget-font-lg': fontSizes.lg,
        '--voice-widget-font-xl': fontSizes.xl,
        '--voice-widget-font-weight-heading': String(typography.headingWeight),
        '--voice-widget-font-weight-body': String(typography.bodyWeight),
        '--voice-widget-line-height': typography.lineHeight || '1.5',
        '--voice-widget-radius-panel': getRadiusValue(theme.radius),
        '--voice-widget-shadow': getShadowValue(theme.shadow),
      } as React.CSSProperties;
    }, [mergedConfig]);

    const activeCall = ['connected', 'agent_speaking', 'user_listening', 'muted', 'ending'].includes(callState);

    const dynamicStyles = React.useMemo(() => {
      const mobile = mergedConfig.responsive.mobile || {};
      const mobileLauncherSize = typeof mobile.launcherSize === 'number'
        ? `${mobile.launcherSize}px`
        : mobile.launcherSize === 'small' ? '44px' : mobile.launcherSize === 'large' ? '68px' : '56px';

      const mobileBottomOffset = mobile.bottomOffset !== undefined ? `${mobile.bottomOffset}px` : '16px';
      const mobileHorizontalOffset = mobile.horizontalOffset !== undefined ? `${mobile.horizontalOffset}px` : '16px';
      
      let mobilePanelWidth = mobile.panelWidth !== undefined ? (typeof mobile.panelWidth === 'number' ? `${mobile.panelWidth}px` : mobile.panelWidth) : 'min(340px, calc(100vw - 32px))';
      if (!mergedConfig.responsive.fullscreenOnMobile && mobilePanelWidth === 'calc(100vw - 32px)') {
        mobilePanelWidth = 'min(340px, calc(100vw - 32px))';
      }

      let mobilePanelMaxHeight = mobile.panelMaxHeight !== undefined ? (typeof mobile.panelMaxHeight === 'number' ? `${mobile.panelMaxHeight}px` : mobile.panelMaxHeight) : 'min(420px, 70vh)';
      if (!mergedConfig.responsive.fullscreenOnMobile && (mobilePanelMaxHeight === '90vh' || mobilePanelMaxHeight === '72vh')) {
        mobilePanelMaxHeight = 'min(420px, 70vh)';
      }

      const launcherPos = mergedConfig.launcher.position || 'bottom-right';
      const vertProp = launcherPos.startsWith('bottom') ? 'bottom' : 'top';
      const horizProp = launcherPos.endsWith('right') ? 'right' : 'left';

      const panelPos = mergedConfig.panel.position || launcherPos;
      const panelVertProp = panelPos.startsWith('bottom') ? 'bottom' : 'top';
      const panelHorizProp = panelPos.endsWith('right') ? 'right' : 'left';

      return `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 var(--voice-widget-primary-ring); }
          70% { box-shadow: 0 0 0 16px var(--voice-widget-primary-ring-transparent); }
          100% { box-shadow: 0 0 0 0 var(--voice-widget-primary-ring-transparent); }
        }
        @keyframes pulseWidgetRing {
          0% { box-shadow: 0 0 0 0 var(--voice-widget-primary-ring); }
          70% { box-shadow: 0 0 0 12px var(--voice-widget-primary-ring-transparent); }
          100% { box-shadow: 0 0 0 0 var(--voice-widget-primary-ring-transparent); }
        }
        @keyframes pulseConnecting {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes pulseAgentSpeaking {
          0% { box-shadow: 0 0 0 0 var(--voice-widget-primary-ring); }
          70% { box-shadow: 0 0 0 12px var(--voice-widget-primary-ring-transparent); }
          100% { box-shadow: 0 0 0 0 var(--voice-widget-primary-ring-transparent); }
        }
        @keyframes pulseUserSpeaking {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          70% { box-shadow: 0 0 0 12px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        @keyframes waveScale {
          0%, 100% { transform: scaleY(0.2); }
          50% { transform: scaleY(1); }
        }
        .widget-wave-bar {
          width: 4px;
          border-radius: 2px;
          transform-origin: center;
          transition: background-color 0.3s ease;
        }

        @media (max-width: ${mergedConfig.responsive.mobileBreakpoint}px) {
          .voice-widget-launcher-container {
            ${vertProp}: ${mobileBottomOffset} !important;
            ${horizProp}: ${mobileHorizontalOffset} !important;
          }
          .voice-widget-launcher-btn {
            width: ${mobileLauncherSize} !important;
            height: ${mobileLauncherSize} !important;
          }
          .voice-widget-panel-container {
            width: min(calc(100vw - 24px), 420px) !important;
            max-width: calc(100vw - 24px) !important;
            max-height: ${mobilePanelMaxHeight} !important;
            left: 50% !important;
            right: auto !important;
            transform: translateX(-50%) !important;
            ${panelVertProp}: ${mergedConfig.responsive.fullscreenOnMobile ? '0' : mobileBottomOffset} !important;
            ${mergedConfig.responsive.fullscreenOnMobile ? `
              position: fixed !important;
              width: 100vw !important;
              height: 100vh !important;
              max-height: 100vh !important;
              border-radius: 0px !important;
              border: none !important;
              top: 0 !important;
              bottom: 0 !important;
              left: 0 !important;
              right: 0 !important;
              transform: none !important;
              z-index: ${(mergedConfig.launcher.zIndex ?? 1000) + 1} !important;
            ` : ''}
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-delay: 0s !important;
            animation-duration: 0s !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0s !important;
            scroll-behavior: auto !important;
          }
        }
      `;
    }, [mergedConfig]);

    return (
      <div
        style={{
          ...cssVars,
          display: 'contents',
          fontFamily: 'var(--voice-widget-font-family)',
        }}
      >
        <style
          dangerouslySetInnerHTML={{
            __html: dynamicStyles,
          }}
        />

        {isFloating && (
          <VoiceAgentLauncher
            onClick={() => setIsOpen((prev) => !prev)}
            config={mergedConfig}
            isOpen={isOpen}
            isActive={activeCall}
          />
        )}

        <VoiceAgentPanel
          config={mergedConfig}
          isOpen={isFloating ? isOpen : true}
          onClose={() => {
            setIsOpen(false);
            if (typeof window !== 'undefined') {
              try {
                sessionStorage.removeItem(`myfrontdesk_reopen_${widgetId || 'default'}`);
              } catch (_) {}
            }
          }}
          callState={callState}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isLoading={['connecting', 'permission_required'].includes(callState)}
          isActive={activeCall}
          errorMessage={errorMessage}
          duration={duration}
          isMuted={isMuted}
          agentSpeaking={agentSpeaking}
          userSpeaking={userSpeaking}
          onStartCall={startCall}
          onStopCall={stopCall}
          onToggleMute={toggleMute}
          chatMessages={chatMessages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendChatMessage={handleSendChatMessage}
          onSelectTemplateMessage={(msg) => sendChatMessage(msg)}
          chatTyping={chatTyping}
          transcript={enrichedTranscript}
          transcriptEndRef={transcriptEndRef}
          parseStatusMessage={parseStatusMessage}
          onNewChat={handleNewChat}
          cards={activeCards}
          onDismissCards={() => setDismissedCardTopic('dismissed')}
          isExpanded={activeCards.length > 0 || isManuallyExpanded}
          onToggleExpand={() => setIsManuallyExpanded(prev => !prev)}
          onMinimize={() => setIsOpen(false)}
        />
      </div>
    );
  }
);

VoiceAgentWidget.displayName = 'VoiceAgentWidget';
export default VoiceAgentWidget;
