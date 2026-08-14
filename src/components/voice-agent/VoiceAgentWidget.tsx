import React, { useImperativeHandle, forwardRef, useState, useRef, useEffect, useCallback } from 'react';
import type { RetellWebClient } from 'retell-client-js-sdk';

// Icon definitions matching the existing visual system
const PHONE_PATH = ['M6.6 4.2h3.4l1.3 5-2.5 1.6a12.4 12.4 0 0 0 5.9 5.9l1.6-2.5 5 1.3v3.4a2 2 0 0 1-2.1 2C10.7 20.2 3.8 13.3 3.1 5.9c-.1-1 .7-1.7 1.6-1.7z'];
const CHECK_PATHS = ['M5 12.5l4.5 4.5L19 7'];

function renderIcon(paths: string[], size = 20, stroke = 1.75, color = 'currentColor') {
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

export interface TranscriptMessage {
  role: 'user' | 'agent';
  content: string;
}

interface VoiceAgentWidgetProps {
  onCallStateChange?: (state: CallState) => void;
}

export interface VoiceAgentWidgetRef {
  startCall: () => Promise<void>;
  stopCall: () => void;
  callState: CallState;
}

const VoiceAgentWidget = forwardRef<VoiceAgentWidgetRef, VoiceAgentWidgetProps>(({ onCallStateChange }, ref) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clientRef = useRef<RetellWebClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStartingRef = useRef(false);

  // Sync state update with parent callback
  const updateState = useCallback((newState: CallState) => {
    setCallState(newState);
    if (onCallStateChange) {
      onCallStateChange(newState);
    }
  }, [onCallStateChange]);

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

  const startCall = useCallback(async () => {
    // 1. Guard state transitions to prevent concurrent calls or double start
    if (callState !== 'idle' && callState !== 'ended' && callState !== 'error') {
      return;
    }
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    updateState('connecting');
    setErrorMessage(null);
    setTranscript([]);
    setIsMuted(false);
    setAgentSpeaking(false);
    setUserSpeaking(false);

    let activeClient: RetellWebClient | null = null;

    try {
      // Clean up any stale instances first
      if (clientRef.current) {
        try {
          clientRef.current.stopCall();
        } catch {}
        clientRef.current = null;
      }

      // Check for HTTPS secure context (required by browsers for mic permissions)
      if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
        throw new Error('Microphone access requires a secure context (HTTPS). Please ensure you are visiting via a secure connection.');
      }

      // 2. Request mic permissions proactively
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

      // 3. Request Access Token from backend proxy
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

      // Keep token in memory local scope only
      const token = data.accessToken;
      sessionIdRef.current = data.sessionId;
      callIdRef.current = data.callId;

      // 4. Import SDK dynamically and instantiate client fresh
      const { RetellWebClient } = await import('retell-client-js-sdk');
      activeClient = new RetellWebClient();
      clientRef.current = activeClient;

      // Register SDK event listeners
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

      // 5. Connection timeout of 15 seconds
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
      }, 15000);

      // Start call
      await activeClient.startCall({
        accessToken: token,
        emitRawAudioSamples: true
      });

    } catch (err) {
      console.error('Error starting voice assistant:', err);
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
    // Guard against redundant stop calls
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
        console.error('Error stopping call:', err);
      }
    }
  }, [callState, updateState]);

  const toggleMute = useCallback(() => {
    // Guard: Mute is only allowed if call is actively connected
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

  // Expose start/stop call controls to parent component
  useImperativeHandle(ref, () => ({
    startCall,
    stopCall,
    callState
  }), [startCall, stopCall, callState]);

  // Clean up calls and event handlers on unmount and page navigation
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
      if (clientRef.current) {
        try {
          clientRef.current.stopCall();
        } catch {}
      }
    };
  }, []);

  // Idle state auto-reset when call ends successfully
  useEffect(() => {
    if (callState === 'ended') {
      const timer = setTimeout(() => {
        updateState('idle');
        setTranscript([]);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [callState, updateState]);

  const isLoading = ['connecting', 'permission_required'].includes(callState);
  const isActive = ['connected', 'agent_speaking', 'user_listening', 'muted', 'ending'].includes(callState);

  return (
    <div style={{
      position: 'relative',
      padding: '40px 32px',
      borderRadius: '24px',
      background: 'rgba(251,253,255,0.92)',
      border: '1px solid rgba(14,27,42,0.12)',
      boxShadow: '0 1px 2px rgba(14,27,42,0.06), 0 30px 60px -30px rgba(14,27,42,0.22)',
      minHeight: '350px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '22px',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
      width: '100%',
      fontFamily: "'Figtree', sans-serif"
    }}>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />

      {/* State 1: Idle */}
      {callState === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px', textAlign: 'center', width: '100%' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: '#2F8FE0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 8px 24px -6px rgba(47,143,224,0.4)',
            animation: 'pulseRing 2s infinite'
          }}>
            {renderIcon(PHONE_PATH, 28, 1.9, 'white')}
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px', color: '#0E1B2A' }}>Talk to our AI Agent</h3>
            <p style={{ fontSize: '14.5px', color: 'rgba(14,27,42,0.6)', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>
              Experience the virtual front desk receptionist live in your browser.
            </p>
          </div>
          <button
            onClick={startCall}
            className="btn-hover-transform"
            style={{
              padding: '14px 28px',
              borderRadius: '12px',
              background: '#2F8FE0',
              border: 'none',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(47, 143, 224, 0.2)',
              transition: 'all 0.25s ease'
            }}
          >
            Start a Conversation
          </button>
        </div>
      )}

      {/* State 2: Connecting & Microphone permission */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px', textAlign: 'center', width: '100%' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: '#D9714B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            animation: 'pulseConnecting 1.5s infinite'
          }}>
            <svg style={{ width: '28px', height: '28px', animation: 'spin 1.5s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" strokeDasharray="38 12" strokeDashoffset="0" />
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 6px', color: '#0E1B2A' }}>Connecting...</h3>
            <p style={{ fontSize: '13.5px', color: 'rgba(14,27,42,0.6)', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>
              {callState === 'permission_required' ? 'Please allow microphone access when prompted...' : 'Connecting to front desk...'}
            </p>
          </div>
          <button
            disabled
            style={{
              padding: '14px 28px',
              borderRadius: '12px',
              background: 'rgba(14,27,42,0.1)',
              border: 'none',
              color: 'rgba(14,27,42,0.4)',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'not-allowed'
            }}
          >
            Please Wait
          </button>
        </div>
      )}

      {/* State 3: Connected / Agent speaking / User speaking */}
      {isActive && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%' }}>
          <div style={{
            width: '76px',
            height: '76px',
            borderRadius: '50%',
            background: agentSpeaking ? '#2F8FE0' : userSpeaking ? '#22C55E' : 'rgba(14,27,42,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            transition: 'background-color 0.4s ease, transform 0.4s ease',
            animation: agentSpeaking
              ? 'pulseAgentSpeaking 1.2s infinite'
              : userSpeaking
              ? 'pulseUserSpeaking 1.2s infinite'
              : 'none'
          }}>
            {agentSpeaking ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 10v4M6 6v12M9 4v16M12 7v10M15 5v14M18 8v8M21 10v4" />
              </svg>
            ) : userSpeaking ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
              </svg>
            ) : (
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'white' }} />
            )}
          </div>

          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 4px', color: '#0E1B2A', textAlign: 'center' }}>
              {callState === 'ending' ? 'Ending call...' : "You're connected"}
            </h3>
            <p style={{ fontSize: '13px', color: 'rgba(14,27,42,0.5)', margin: 0, textAlign: 'center' }}>
              {isMuted
                ? 'Microphone muted'
                : callState === 'ending'
                ? 'Closing session'
                : agentSpeaking
                ? 'Front Desk speaking'
                : userSpeaking
                ? 'Listening to you...'
                : 'Front Desk listening'}
            </p>
          </div>

          {/* Safe Live Transcript Area */}
          <div style={{
            width: '100%',
            background: 'rgba(14,27,42,0.04)',
            borderRadius: '16px',
            padding: '16px',
            minHeight: '80px',
            maxHeight: '120px',
            overflowY: 'auto',
            fontSize: '13.5px',
            lineHeight: '1.5',
            color: 'rgba(14,27,42,0.78)',
            textAlign: 'left',
            border: '1px solid rgba(14,27,42,0.06)'
          }}>
            {transcript && transcript.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {transcript.map((msg: any, idx: number) => (
                  <div key={idx} style={{ fontSize: '13px', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700, color: msg.role === 'user' ? '#22C55E' : '#2F8FE0' }}>
                      {msg.role === 'user' ? 'You' : 'Agent'}:
                    </span>{' '}
                    <span style={{ color: '#0E1B2A' }}>{msg.content}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ color: 'rgba(14,27,42,0.4)', fontStyle: 'italic' }}>
                {"Say \"Hello\" or ask a question to start..."}
              </span>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={toggleMute}
              disabled={callState === 'ending'}
              style={{
                width: '46px',
                height: '46px',
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
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
                  <path d="M17 11a6.97 6.97 0 0 1-1.78 4.62" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                </svg>
              )}
            </button>

            <button
              onClick={stopCall}
              disabled={callState === 'ending'}
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: '#EF4444',
                color: 'white',
                border: 'none',
                cursor: callState === 'ending' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                transition: 'all 0.2s ease',
                opacity: callState === 'ending' ? 0.5 : 1
              }}
              title="End call"
              aria-label="End call"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(135deg)', transformOrigin: 'center' }}>
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.8 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-5.33-5.33A19.79 19.79 0 0 1 2 4.18 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .8 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* State 4: Error */}
      {callState === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', textAlign: 'center', width: '100%' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#EF4444'
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px', color: '#EF4444' }}>Connection Failed</h3>
            <p style={{ fontSize: '13.5px', color: 'rgba(14,27,42,0.6)', margin: 0, lineHeight: 1.5, maxWidth: '260px' }}>
              {errorMessage || 'Unable to start the voice assistant. Please try again.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'center' }}>
            <button
              onClick={() => updateState('idle')}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                background: 'rgba(14,27,42,0.06)',
                border: 'none',
                color: '#0E1B2A',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={startCall}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                background: '#2F8FE0',
                border: 'none',
                color: 'white',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* State 5: Ended */}
      {callState === 'ended' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px', textAlign: 'center', width: '100%' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(14,27,42,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0E1B2A'
          }}>
            {renderIcon(CHECK_PATHS, 26, 2.2, '#2F8FE0')}
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px', color: '#0E1B2A' }}>Conversation ended</h3>
            <p style={{ fontSize: '13.5px', color: 'rgba(14,27,42,0.6)', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>
              Thank you for trying out MyFrontDesk. Feel free to start another conversation at any time.
            </p>
          </div>
          <button
            onClick={() => {
              updateState('idle');
              setTranscript([]);
            }}
            className="btn-hover-transform"
            style={{
              padding: '12px 24px',
              borderRadius: '10px',
              background: 'rgba(47,143,224,0.1)',
              border: '1px solid rgba(47,143,224,0.3)',
              color: '#2F8FE0',
              fontSize: '14.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Start Another Call
          </button>
        </div>
      )}
    </div>
  );
});

VoiceAgentWidget.displayName = 'VoiceAgentWidget';
export default VoiceAgentWidget;
