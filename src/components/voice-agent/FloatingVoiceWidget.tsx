import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { RetellWebClient } from 'retell-client-js-sdk';

// Icon definitions
const PHONE_ICON_PATH = ['M6.6 4.2h3.4l1.3 5-2.5 1.6a12.4 12.4 0 0 0 5.9 5.9l1.6-2.5 5 1.3v3.4a2 2 0 0 1-2.1 2C10.7 20.2 3.8 13.3 3.1 5.9c-.1-1 .7-1.7 1.6-1.7z'];
const CLOSE_ICON_PATH = ['M18 6L6 18','M6 6l12 12'];

function renderSvgIcon(paths: string[], size = 20, stroke = 1.75, color = 'currentColor') {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

export type CallState =
  | 'idle'
  | 'connecting'
  | 'permission_required'
  | 'connected'
  | 'agent_speaking'
  | 'user_listening'
  | 'muted'
  | 'ending'
  | 'ended'
  | 'error';

interface TranscriptMessage {
  role: 'user' | 'agent';
  content: string;
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
            statusType: statusText.toLowerCase()
          };
        }
        if ('message' in parsed && ('event' in parsed || 'type' in parsed)) {
          const statusText = String(parsed.message);
          return {
            isStatus: true,
            text: statusText,
            statusType: String(parsed.type || parsed.event || 'default').toLowerCase()
          };
        }
      }
    }
  } catch (e) {
    // Not valid JSON
  }
  return { isStatus: false, text: content, statusType: '' };
}

export default function FloatingVoiceWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New text chat states
  const [activeTab, setActiveTab] = useState<'voice' | 'text'>('voice');
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<TranscriptMessage[]>([
    { role: 'agent', content: 'Hi there! I am your AI front desk receptionist. How can I help you today?' }
  ]);
  const [chatTyping, setChatTyping] = useState(false);

  const clientRef = useRef<RetellWebClient | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStartingRef = useRef(false);

  // Helper to update state
  const updateState = useCallback((newState: CallState) => {
    setCallState(newState);
  }, []);

  // Safe client telemetry logger
  const sendTelemetry = useCallback(async (event: 'call_start' | 'call_end' | 'call_error', errorDetails?: string) => {
    if (!sessionIdRef.current || !callIdRef.current) return;
    try {
      await fetch('/api/retell/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          callId: callIdRef.current,
          event,
          ...(errorDetails ? { errorDetails } : {})
        })
      });
    } catch {
      console.warn('[telemetry] Logging event failed:', event);
    }
  }, []);

  const isCallActive = ['connected', 'agent_speaking', 'user_listening', 'muted'].includes(callState);

  // Initialize call timer
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
  }, [isCallActive]);

  // Auto-scroll transcripts and chat messages
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, chatMessages]);

  const handleSendChatMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

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
          content: text
        })
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
          content: m.content
        }));
        setChatMessages((prev) => [...prev, ...mapped]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'agent', content: 'Sorry, I encountered an issue connecting to the chat service. Please try again.' }
      ]);
    } finally {
      setChatTyping(false);
    }
  }, [chatInput, chatId]);

  const startCall = useCallback(async () => {
    // Guard state transitions
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
    setIsOpen(true);
    setAgentSpeaking(false);
    setUserSpeaking(false);

    let activeClient: RetellWebClient | null = null;

    try {
      if (clientRef.current) {
        try {
          clientRef.current.stopCall();
        } catch {}
        clientRef.current = null;
      }

      if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
        throw new Error('Microphone access requires a secure context (HTTPS). Please ensure you are visiting via a secure connection.');
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
      const res = await fetch('/api/retell/create-web-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'The voice receptionist service is currently unavailable. Please try again.');
      }

      const data = await res.json();
      if (!data.accessToken || !data.callId || !data.sessionId) {
        throw new Error('Failed to establish a call session with our servers.');
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
        console.error('Floating Widget Retell SDK error:', err);
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
        console.warn('Floating call connection timed out.');
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
      }, 15000);

      await activeClient.startCall({
        accessToken: token,
        emitRawAudioSamples: true
      });

    } catch (err) {
      console.error('Error starting floating call:', err);
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      if (activeClient) {
        try {
          activeClient.stopCall();
        } catch {}
      }
      if (clientRef.current === activeClient) {
        clientRef.current = null;
      }

      const errorMsg = err instanceof Error ? err.message : '';
      const friendlyMsg = errorMsg && !errorMsg.includes('fetch') && !errorMsg.includes('HTTP') && !errorMsg.includes('Fetch')
        ? errorMsg
        : 'Unable to start the voice assistant. Please try again.';
      
      setErrorMessage(friendlyMsg);
      updateState('error');
      isStartingRef.current = false;
    }
  }, [callState, updateState, sendTelemetry]);

  const stopCall = useCallback(() => {
    if (callState === 'idle' || callState === 'ending' || callState === 'ended') {
      return;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    updateState('ending');
    if (clientRef.current) {
      try {
        clientRef.current.stopCall();
      } catch (err) {
        console.error('Error stopping floating call:', err);
      }
    }
  }, [callState, updateState]);

  const toggleMute = useCallback(() => {
    if (!['connected', 'agent_speaking', 'user_listening', 'muted'].includes(callState)) {
      return;
    }
    if (!clientRef.current) return;
    
    const nextMute = !isMuted;
    if (nextMute) {
      clientRef.current.mute();
      setCallState('muted');
    } else {
      clientRef.current.unmute();
      setCallState(agentSpeaking ? 'agent_speaking' : 'user_listening');
    }
    setIsMuted(nextMute);
  }, [callState, isMuted, agentSpeaking]);

  // Clean up WebClient on unmount and page navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (clientRef.current) {
        try {
          clientRef.current.stopCall();
        } catch {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (clientRef.current) {
        try {
          clientRef.current.stopCall();
        } catch {}
      }
    };
  }, []);

  // Auto-reset ended state
  useEffect(() => {
    if (callState === 'ended') {
      const t = setTimeout(() => {
        updateState('idle');
        setTranscript([]);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [callState, updateState]);

  const formatTime = (secCount: number) => {
    const m = Math.floor(secCount / 60).toString().padStart(2, '0');
    const s = (secCount % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isLoading = ['connecting', 'permission_required'].includes(callState);
  const isActive = ['connected', 'agent_speaking', 'user_listening', 'muted', 'ending'].includes(callState);

  return (
    <div style={{ fontFamily: "'Figtree', sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes floatWidgetFadeIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseWidgetRing {
          0% { box-shadow: 0 0 0 0 rgba(47, 143, 224, 0.4); }
          70% { box-shadow: 0 0 0 12px rgba(47, 143, 224, 0); }
          100% { box-shadow: 0 0 0 0 rgba(47, 143, 224, 0); }
        }
        @keyframes waveScale {
          0%, 100% { transform: scaleY(0.2); }
          50% { transform: scaleY(1); }
        }
        .widget-wave-bar {
          width: 4px;
          border-radius: 2px;
          transform-origin: center;
        }
      `}} />

      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: isActive ? '#22C55E' : '#2F8FE0',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(14,27,42,0.2)',
          zIndex: 9999,
          transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          animation: isActive ? 'none' : 'pulseWidgetRing 2s infinite'
        }}
        title="Talk to Agent"
        aria-label="Talk to Agent"
      >
        {isActive ? (
          /* Live Speaking Visualizer on FAB itself when connected and panel is closed */
          <div style={{ display: 'flex', gap: '3px', height: '20px', alignItems: 'center' }}>
            <div className="widget-wave-bar" style={{ height: '100%', background: 'white', animation: 'waveScale 0.6s ease-in-out infinite', animationDelay: '0.1s' }} />
            <div className="widget-wave-bar" style={{ height: '100%', background: 'white', animation: 'waveScale 0.6s ease-in-out infinite', animationDelay: '0.3s' }} />
            <div className="widget-wave-bar" style={{ height: '100%', background: 'white', animation: 'waveScale 0.6s ease-in-out infinite', animationDelay: '0.2s' }} />
          </div>
        ) : (
          renderSvgIcon(PHONE_ICON_PATH, 24, 2, 'white')
        )}
      </button>

      {/* Floating Call Panel Overlay */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '96px',
          right: '24px',
          width: '360px',
          maxHeight: '480px',
          borderRadius: '20px',
          background: 'rgba(255, 255, 255, 0.98)',
          border: '1px solid rgba(14, 27, 42, 0.12)',
          boxShadow: '0 10px 40px -10px rgba(14, 27, 42, 0.22)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
          overflow: 'hidden',
          animation: 'floatWidgetFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(14, 27, 42, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(14, 27, 42, 0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: isActive ? '#22C55E' : isLoading ? '#D9714B' : 'rgba(14,27,42,0.2)',
                animation: isLoading ? 'spin 1s linear infinite' : 'none'
              }} />
              <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0E1B2A' }}>
                AI Front Desk Agent
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(14,27,42,0.4)',
                display: 'flex',
                padding: '4px'
              }}
              title="Close panel"
            >
              {renderSvgIcon(CLOSE_ICON_PATH, 16, 2)}
            </button>
          </div>

          {/* Body Content */}
          <div style={{
            padding: '20px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            overflowY: activeTab === 'text' && callState === 'idle' ? 'hidden' : 'auto'
          }}>
            {/* Tab Selector - Only show when callState is 'idle' */}
            {callState === 'idle' && (
              <div style={{
                display: 'flex',
                background: 'rgba(14,27,42,0.06)',
                padding: '4px',
                borderRadius: '12px',
                width: '100%',
                marginBottom: '4px'
              }}>
                <button
                  onClick={() => setActiveTab('voice')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: activeTab === 'voice' ? '#FFFFFF' : 'transparent',
                    border: 'none',
                    color: activeTab === 'voice' ? '#0E1B2A' : 'rgba(14,27,42,0.6)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: activeTab === 'voice' ? '0 2px 8px rgba(14,27,42,0.08)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Voice Chat
                </button>
                <button
                  onClick={() => setActiveTab('text')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: activeTab === 'text' ? '#FFFFFF' : 'transparent',
                    border: 'none',
                    color: activeTab === 'text' ? '#0E1B2A' : 'rgba(14,27,42,0.6)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: activeTab === 'text' ? '0 2px 8px rgba(14,27,42,0.08)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Text Chat
                </button>
              </div>
            )}

            {/* Connection States */}
            {isLoading && activeTab === 'voice' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '30px 0', textAlign: 'center' }}>
                <svg style={{ width: '32px', height: '32px', animation: 'spin 1.2s linear infinite', color: '#D9714B' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeDasharray="36 12" />
                </svg>
                <div style={{ fontSize: '13.5px', color: 'rgba(14,27,42,0.6)' }}>
                  {callState === 'permission_required' ? 'Please allow microphone access...' : 'Connecting securely...'}
                </div>
              </div>
            )}

            {/* Error State */}
            {callState === 'error' && activeTab === 'voice' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0', textAlign: 'center' }}>
                <div style={{ color: '#EF4444' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div style={{ fontSize: '13.5px', color: '#EF4444', fontWeight: 600 }}>Connection Failed</div>
                <div style={{ fontSize: '12.5px', color: 'rgba(14,27,42,0.6)', maxWidth: '240px' }}>
                  {errorMessage || 'Unable to start call.'}
                </div>
                <button
                  onClick={startCall}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: '#2F8FE0',
                    border: 'none',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: '8px'
                  }}
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Ended State */}
            {callState === 'ended' && activeTab === 'voice' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '30px 0', textAlign: 'center' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(34,197,94,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#22C55E'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0E1B2A' }}>Call Ended</div>
                <div style={{ fontSize: '12.5px', color: 'rgba(14,27,42,0.5)' }}>Thank you for calling.</div>
              </div>
            )}

            {/* Idle State / Intro */}
            {callState === 'idle' && activeTab === 'voice' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '20px 0', textAlign: 'center' }}>
                <p style={{ fontSize: '13.5px', lineHeight: 1.5, color: 'rgba(14,27,42,0.7)', margin: 0 }}>
                  Have questions about our hours, services, or want to test our virtual receptionist? Start a real-time call!
                </p>
                <button
                  onClick={startCall}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '10px',
                    background: '#2F8FE0',
                    color: 'white',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(47, 143, 224, 0.2)'
                  }}
                >
                  Call AI Assistant
                </button>
              </div>
            )}

            {/* Text Chat Tab */}
            {callState === 'idle' && activeTab === 'text' && (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: 1, minHeight: '320px', height: '100%' }}>
                {/* Scrollable messages container */}
                <div style={{
                  flex: 1,
                  background: 'rgba(14, 27, 42, 0.03)',
                  border: '1px solid rgba(14, 27, 42, 0.08)',
                  borderRadius: '16px',
                  padding: '12px',
                  overflowY: 'auto',
                  maxHeight: '260px',
                  minHeight: '220px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  textAlign: 'left'
                }}>
                  {chatMessages.map((msg, idx) => {
                    const statusInfo = parseStatusMessage(msg.content);
                    if (statusInfo.isStatus) {
                      let bgColor = 'rgba(47, 143, 224, 0.1)';
                      let textColor = '#2F8FE0';
                      let borderColor = 'rgba(47, 143, 224, 0.2)';

                      const type = statusInfo.statusType;
                      if (type.includes('success') || type.includes('booked') || type.includes('completed')) {
                        bgColor = 'rgba(46, 204, 113, 0.1)';
                        textColor = '#2ecc71';
                        borderColor = 'rgba(46, 204, 113, 0.2)';
                      } else if (type.includes('fail') || type.includes('error') || type.includes('reject')) {
                        bgColor = 'rgba(231, 76, 60, 0.1)';
                        textColor = '#e74c3c';
                        borderColor = 'rgba(231, 76, 60, 0.2)';
                      } else if (type.includes('transfer') || type.includes('redirect')) {
                        bgColor = 'rgba(155, 89, 182, 0.1)';
                        textColor = '#9b59b6';
                        borderColor = 'rgba(155, 89, 182, 0.2)';
                      } else if (type.includes('progress') || type.includes('wait') || type.includes('pend') || type.includes('process') || type.includes('look')) {
                        bgColor = 'rgba(241, 196, 15, 0.1)';
                        textColor = '#f1c40f';
                        borderColor = 'rgba(241, 196, 15, 0.2)';
                      }

                      return (
                        <div key={idx} style={{
                          display: 'flex',
                          justifyContent: 'center',
                          width: '100%',
                          margin: '6px 0'
                        }}>
                          <div style={{
                            background: bgColor,
                            color: textColor,
                            border: `1px solid ${borderColor}`,
                            borderRadius: '12px',
                            padding: '8px 16px',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            textAlign: 'center',
                            maxWidth: '90%',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                            textTransform: 'capitalize'
                          }}>
                            {statusInfo.text}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={idx} style={{
                        display: 'flex',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        width: '100%'
                      }}>
                        <div style={{
                          maxWidth: '85%',
                          background: msg.role === 'user' ? '#2F8FE0' : '#FFFFFF',
                          color: msg.role === 'user' ? '#FFFFFF' : '#0E1B2A',
                          border: msg.role === 'user' ? 'none' : '1px solid rgba(14, 27, 42, 0.1)',
                          borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                          padding: '8px 12px',
                          fontSize: '13px',
                          lineHeight: 1.45,
                          boxShadow: '0 2px 6px rgba(14,27,42,0.03)'
                        }}>
                          {msg.content}
                        </div>
                      </div>
                    );
                  })}
                  {chatTyping && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
                      <div style={{
                        background: '#FFFFFF',
                        border: '1px solid rgba(14, 27, 42, 0.1)',
                        borderRadius: '14px 14px 14px 2px',
                        padding: '8px 12px',
                        fontSize: '13px',
                        color: 'rgba(14,27,42,0.5)',
                        boxShadow: '0 2px 6px rgba(14,27,42,0.03)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <span>Agent is typing</span>
                        <span style={{ animation: 'pulseConnecting 1.5s infinite', fontWeight: 'bold' }}>...</span>
                      </div>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>

                {/* Form input */}
                <form onSubmit={handleSendChatMessage} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type your message to the agent..."
                    disabled={chatTyping}
                    style={{
                      flex: 1,
                      border: '1px solid rgba(14,27,42,0.15)',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      fontSize: '13px',
                      background: '#FFFFFF',
                      outline: 'none',
                      color: '#0E1B2A',
                      fontFamily: "'Figtree', sans-serif"
                    }}
                  />
                  <button
                    type="submit"
                    disabled={chatTyping || !chatInput.trim()}
                    style={{
                      background: '#2F8FE0',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0 14px',
                      cursor: (chatTyping || !chatInput.trim()) ? 'not-allowed' : 'pointer',
                      opacity: (chatTyping || !chatInput.trim()) ? 0.6 : 1,
                      fontWeight: 600,
                      fontSize: '13px',
                      fontFamily: "'Figtree', sans-serif",
                      boxShadow: '0 4px 12px rgba(47, 143, 224, 0.15)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {/* Connected Active Call Details */}
            {isActive && activeTab === 'voice' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                {/* Timer & Speaking Waves */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(14, 27, 42, 0.03)',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(14, 27, 42, 0.05)'
                }}>
                  {/* Timer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E', animation: 'pulseConnecting 1.5s infinite' }} />
                    <span style={{ fontSize: '13.5px', fontFamily: 'monospace', fontWeight: 600, color: 'rgba(14,27,42,0.8)' }}>
                      {formatTime(duration)}
                    </span>
                  </div>

                  {/* Wave Visualizer */}
                  <div style={{ display: 'flex', gap: '3px', height: '18px', alignItems: 'center' }}>
                    <div className="widget-wave-bar" style={{
                      height: '100%',
                      background: agentSpeaking ? '#2F8FE0' : userSpeaking ? '#22C55E' : 'rgba(14,27,42,0.2)',
                      animation: agentSpeaking || userSpeaking ? 'waveScale 0.7s ease-in-out infinite' : 'none',
                      animationDelay: '0.1s'
                    }} />
                    <div className="widget-wave-bar" style={{
                      height: '100%',
                      background: agentSpeaking ? '#2F8FE0' : userSpeaking ? '#22C55E' : 'rgba(14,27,42,0.2)',
                      animation: agentSpeaking || userSpeaking ? 'waveScale 0.7s ease-in-out infinite' : 'none',
                      animationDelay: '0.3s'
                    }} />
                    <div className="widget-wave-bar" style={{
                      height: '100%',
                      background: agentSpeaking ? '#2F8FE0' : userSpeaking ? '#22C55E' : 'rgba(14,27,42,0.2)',
                      animation: agentSpeaking || userSpeaking ? 'waveScale 0.7s ease-in-out infinite' : 'none',
                      animationDelay: '0.2s'
                    }} />
                    <div className="widget-wave-bar" style={{
                      height: '100%',
                      background: agentSpeaking ? '#2F8FE0' : userSpeaking ? '#22C55E' : 'rgba(14,27,42,0.2)',
                      animation: agentSpeaking || userSpeaking ? 'waveScale 0.7s ease-in-out infinite' : 'none',
                      animationDelay: '0.4s'
                    }} />
                  </div>
                </div>

                {/* Safe Live Transcripts */}
                <div style={{
                  flex: 1,
                  background: 'rgba(14, 27, 42, 0.04)',
                  borderRadius: '12px',
                  padding: '14px',
                  minHeight: '140px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  border: '1px solid rgba(14, 27, 42, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  {transcript && transcript.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {transcript.map((msg: TranscriptMessage, idx: number) => (
                        <div key={idx} style={{ fontSize: '13px', lineHeight: 1.4 }}>
                          <span style={{ fontWeight: 700, color: msg.role === 'user' ? '#22C55E' : '#2F8FE0' }}>
                            {msg.role === 'user' ? 'You' : 'Agent'}:
                          </span>{' '}
                          <span style={{ color: '#0E1B2A' }}>{msg.content}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'rgba(14,27,42,0.4)', fontStyle: 'italic', fontSize: '12.5px', textAlign: 'center', marginTop: '40px' }}>
                      {"Say \"Hello\" or ask a question to start..."}
                    </span>
                  )}
                  <div ref={transcriptEndRef} />
                </div>

                {/* Call Footer Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '4px' }}>
                  {/* Mute toggle */}
                  <button
                    onClick={toggleMute}
                    disabled={callState === 'ending'}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: isMuted ? '#EF4444' : 'rgba(14,27,42,0.06)',
                      color: isMuted ? 'white' : '#0E1B2A',
                      border: 'none',
                      cursor: callState === 'ending' ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      opacity: callState === 'ending' ? 0.5 : 1
                    }}
                    title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {isMuted ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
                        <path d="M17 11a6.97 6.97 0 0 1-1.78 4.62" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                      </svg>
                    )}
                  </button>

                  {/* End Call */}
                  <button
                    onClick={stopCall}
                    disabled={callState === 'ending'}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '30px',
                      background: '#EF4444',
                      border: 'none',
                      color: 'white',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      cursor: callState === 'ending' ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
                      opacity: callState === 'ending' ? 0.5 : 1
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(135deg)', transformOrigin: 'center' }}>
                      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.8 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-5.33-5.33A19.79 19.79 0 0 1 2 4.18 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .8 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                    </svg>
                    <span>{callState === 'ending' ? 'Ending...' : 'End Call'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
