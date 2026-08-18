import React, { useImperativeHandle, forwardRef, useState, useRef, useEffect, useCallback } from 'react';
import type { RetellWebClient } from 'retell-client-js-sdk';
import { CallState, TranscriptMessage, VoiceWidgetConfig } from '@/config/voiceWidget/types';
export type { CallState };
import { defaultVoiceWidgetConfig, deepMerge } from '@/config/voiceWidget/default';
import VoiceAgentLauncher from './VoiceAgentLauncher';
import VoiceAgentPanel from './VoiceAgentPanel';

interface VoiceAgentWidgetProps {
  onCallStateChange?: (state: CallState) => void;
  config?: Partial<VoiceWidgetConfig>;
  overrides?: Partial<VoiceWidgetConfig>;
  widgetId?: string;
  isDemo?: boolean;
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
  ({ onCallStateChange, config: clientConfig, overrides, widgetId, isDemo = false }, ref) => {
    // 1. Deep merge configurations
    const mergedConfig = React.useMemo(() => {
      const step1 = deepMerge(defaultVoiceWidgetConfig, clientConfig);
      return deepMerge(step1, overrides);
    }, [clientConfig, overrides]);

    const isFloating = mergedConfig.mode === 'floating';

    // 2. State management
    const [isOpen, setIsOpen] = useState(false);
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

    // Synchronize initial text chat state when welcomeMessage configuration changes
    useEffect(() => {
      setChatMessages((prev) => {
        // Only update the initial welcome message if user has not sent messages yet
        if (prev.length <= 1) {
          return [{ role: 'agent', content: mergedConfig.branding.welcomeMessage || "Hi! How can I help you today?" }];
        }
        return prev;
      });
    }, [mergedConfig.branding.welcomeMessage]);

    // Cache for voice transcript results to avoid redundant network calls
    const [voiceResults, setVoiceResults] = useState<Record<string, any[]>>({});
    const fetchedContents = useRef<Set<string>>(new Set());

    useEffect(() => {
      const isCallActive = ['connected', 'agent_speaking', 'user_listening', 'muted'].includes(callState);
      if (!isCallActive) {
        setVoiceResults({});
        fetchedContents.current.clear();
        return;
      }

      transcript.forEach((msg) => {
        const content = msg.content?.trim();
        if (!content || content.length < 5 || msg.isPartial) return;
        if (fetchedContents.current.has(content)) return;
        fetchedContents.current.add(content);

        const targetId = widgetId || 'default';
        fetch(`/api/widgets/${encodeURIComponent(targetId)}/search?query=${encodeURIComponent(content)}`)
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            if (data && Array.isArray(data) && data.length > 0) {
              setVoiceResults((prev) => ({
                ...prev,
                [content]: data,
              }));
            }
          })
          .catch((err) => {
            console.warn('[voice-agent] Failed to search website records for:', content, err);
          });
      });
    }, [transcript, callState, widgetId]);

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
    const isStartingRef = useRef(false);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

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

    // Clean up call on unmount (including demo timers)
    useEffect(() => {
      return () => {
        demoTimersRef.current.forEach(clearTimeout);
        if (demoIntervalRef.current) {
          clearInterval(demoIntervalRef.current);
        }
      };
    }, []);

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

    // Helper to safely stop calls on either Retell or Vapi
    const safeStopCurrentCall = useCallback(() => {
      if (clientRef.current) {
        try {
          if (providerRef.current === 'vapi') {
            clientRef.current.stop();
          } else {
            clientRef.current.stopCall();
          }
        } catch {}
      }
    }, []);

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

    const handleSendChatMessage = useCallback(
      async (e: React.FormEvent) => {
        e.preventDefault();
        const text = chatInput.trim();
        if (!text) return;

        setChatInput('');
        const userMsg: TranscriptMessage = { role: 'user', content: text };
        setChatMessages((prev) => [...prev, userMsg]);
        setChatTyping(true);

        if (isDemo) {
          const t = setTimeout(() => {
            let response = "I received your message! Since we are in the customization preview, this is a simulated response. Once deployed, the agent will reply using your website intelligence.";
            
            const lowerText = text.toLowerCase();
            if (lowerText.includes('hello') || lowerText.includes('hi') || lowerText.includes('hey')) {
              response = `Hello! How can I help you with ${mergedConfig.branding.companyName || 'our services'} today?`;
            } else if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('pricing')) {
              response = `Our pricing packages are customizable! You can configure them in the settings. In a live environment, I would retrieve current pricing data directly from your crawled website pages.`;
            } else if (lowerText.includes('test') || lowerText.includes('working')) {
              response = "Yes, the test chat is fully working! The widget preview responds in real-time to your configuration changes.";
            }

            setChatMessages((prev) => [
              ...prev,
              { role: 'agent', content: response }
            ]);
            setChatTyping(false);
          }, 1000);
          demoTimersRef.current.push(t);
          return;
        }

        try {
          const res = await fetch('/api/retell/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatId,
              content: text,
              widgetId: widgetId || 'default',
            }),
          });

          if (!res.ok) {
            throw new Error('Failed to get response');
          }

          const data = await res.json();
          if (data.chatId) {
            setChatId(data.chatId);
          }
          if (data.messages && Array.isArray(data.messages)) {
            const mapped = data.messages.map((m: any) => ({
              role: m.role === 'agent' ? 'agent' : 'user',
              content: m.content,
              // Carry through structured results from Website Intelligence
              ...(m.results && Array.isArray(m.results) && m.results.length > 0
                ? { results: m.results }
                : {}),
            })) as TranscriptMessage[];
            setChatMessages((prev) => [...prev, ...mapped]);
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
      [chatInput, chatId, isDemo, mergedConfig.branding.companyName, widgetId]
    );

    const startCall = useCallback(async () => {
      if (callState !== 'idle' && callState !== 'ended' && callState !== 'error') {
        return;
      }
      if (isStartingRef.current) return;
      isStartingRef.current = true;

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
        if (clientRef.current) {
          try {
            if (providerRef.current === 'vapi') {
              clientRef.current.stop();
            } else {
              clientRef.current.stopCall();
            }
          } catch {}
          clientRef.current = null;
        }

        if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
          throw new Error(
            'Microphone access requires a secure context (HTTPS). Please ensure you are visiting via a secure connection.'
          );
        }

        updateState('permission_required');
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (micErr) {
          const errorName = micErr instanceof Error ? micErr.name : '';
          if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
            throw new Error('Microphone permission was denied. Please allow microphone access in your browser settings.');
          } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
            throw new Error('No microphone detected. Please connect a microphone and try again.');
          } else {
            throw new Error('Microphone access failed. Please ensure no other application is using it.');
          }
        }

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
          // Inline Vapi path — not yet wired to a single endpoint, handled below
          callEndpoint = '/api/vapi/create-call';
          callBody = { agentId: configAgentId };
        } else {
          // Default: Retell (existing working path)
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
          callIdRef.current = data.callId;

          const { RetellWebClient } = await import('retell-client-js-sdk');
          activeClient = new RetellWebClient();
          clientRef.current = activeClient;

          activeClient.on('call_started', () => {
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }
            updateState('connected');
            sendTelemetry('call_start');
          });

          activeClient.on('call_ended', () => {
            updateState('ended');
            sendTelemetry('call_end');
            setAgentSpeaking(false);
            setUserSpeaking(false);
            isStartingRef.current = false;
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
            }
          });

          activeClient.on('error', (err: { message?: string }) => {
            console.error('Retell SDK error:', err);
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

          await activeClient.startCall({
            accessToken: token,
            emitRawAudioSamples: true,
          });
        }
        
        // ─── Provider: Vapi ─────────────────────────────────────────────────
        else if (data.provider === 'vapi') {
          providerRef.current = 'vapi';
          if (!data.vapiPublicApiKey || !data.vapiAssistantId || !data.sessionId) {
            throw new Error('Failed to retrieve Vapi Web SDK initialization parameters.');
          }

          sessionIdRef.current = data.sessionId;
          callIdRef.current = 'vapi-call';

          const VapiSdk = (await import('@vapi-ai/web')).default;
          activeClient = new VapiSdk(data.vapiPublicApiKey);
          clientRef.current = activeClient;

          let agentSpeakingTimeout: NodeJS.Timeout | null = null;

          activeClient.on('call-start', () => {
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }
            updateState('connected');
            sendTelemetry('call_start');
          });

          activeClient.on('call-end', () => {
            if (agentSpeakingTimeout) {
              clearTimeout(agentSpeakingTimeout);
              agentSpeakingTimeout = null;
            }
            updateState('ended');
            sendTelemetry('call_end');
            setAgentSpeaking(false);
            setUserSpeaking(false);
            isStartingRef.current = false;
            if (clientRef.current === activeClient) {
              clientRef.current = null;
            }
          });

          activeClient.on('message', (message: any) => {
            if (message.type === 'transcript') {
              const role = message.role === 'assistant' ? 'agent' : 'user';
              const content = message.transcript;
              
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
            setUserSpeaking(true);
            setAgentSpeaking(false);
            setCallState((prev) => (prev === 'muted' ? 'muted' : 'user_listening'));
          });

          activeClient.on('speech-end', () => {
            setUserSpeaking(false);
            setCallState((prev) => (prev === 'muted' ? 'muted' : 'user_listening'));
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
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        if (activeClient) {
          try {
            if (providerRef.current === 'vapi') {
              activeClient.stop();
            } else {
              activeClient.stopCall();
            }
          } catch {}
        }
        if (clientRef.current === activeClient) {
          clientRef.current = null;
        }

        const errorMsg = err instanceof Error ? err.message : '';
        const friendlyMsg =
          errorMsg && !errorMsg.includes('fetch') && !errorMsg.includes('HTTP') && !errorMsg.includes('Fetch')
            ? errorMsg
            : 'Unable to start the voice assistant. Please try again.';

        setErrorMessage(friendlyMsg);
        updateState('error');
        isStartingRef.current = false;
      }
    }, [callState, updateState, sendTelemetry, mergedConfig, widgetId, isDemo, clearDemoSimulation]);

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

      const hexToRgb = (hex: string) => {
        const cleaned = hex.replace(/^#/, '');
        if (cleaned.length === 3) {
          const r = parseInt(cleaned[0] + cleaned[0], 16);
          const g = parseInt(cleaned[1] + cleaned[1], 16);
          const b = parseInt(cleaned[2] + cleaned[2], 16);
          return `${r}, ${g}, ${b}`;
        } else if (cleaned.length === 6) {
          const r = parseInt(cleaned.substring(0, 2), 16);
          const g = parseInt(cleaned.substring(2, 4), 16);
          const b = parseInt(cleaned.substring(4, 6), 16);
          return `${r}, ${g}, ${b}`;
        }
        return '47, 143, 224'; // fallback blue
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
            width: ${mobilePanelWidth} !important;
            max-height: ${mobilePanelMaxHeight} !important;
            ${panelVertProp}: ${mergedConfig.responsive.fullscreenOnMobile ? '0' : mobileBottomOffset} !important;
            ${panelHorizProp}: ${mergedConfig.responsive.fullscreenOnMobile ? '0' : mobileHorizontalOffset} !important;
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
          onClose={() => setIsOpen(false)}
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
          chatTyping={chatTyping}
          transcript={enrichedTranscript}
          transcriptEndRef={transcriptEndRef}
          parseStatusMessage={parseStatusMessage}
        />
      </div>
    );
  }
);

VoiceAgentWidget.displayName = 'VoiceAgentWidget';
export default VoiceAgentWidget;
