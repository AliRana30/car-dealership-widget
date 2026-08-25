import React from 'react';
import { CallState, VoiceWidgetConfig } from '@/config/voiceWidget/types';

interface VoiceAgentStatusProps {
  config: VoiceWidgetConfig;
  callState: CallState;
  activeTab: 'voice' | 'text';
  onTabChange: (tab: 'voice' | 'text') => void;
  isLoading: boolean;
  isActive: boolean;
  errorMessage: string | null;
  duration: number;
  isMuted: boolean;
  agentSpeaking: boolean;
  userSpeaking: boolean;
  onStartCall: () => void;
  chatTyping?: boolean;
}

const PHONE_PATH = [
  'M6.6 4.2h3.4l1.3 5-2.5 1.6a12.4 12.4 0 0 0 5.9 5.9l1.6-2.5 5 1.3v3.4a2 2 0 0 1-2.1 2C10.7 20.2 3.8 13.3 3.1 5.9c-.1-1 .7-1.7 1.6-1.7z'
];

export default function VoiceAgentStatus({
  config,
  callState,
  activeTab,
  onTabChange,
  isLoading,
  isActive,
  errorMessage,
  duration,
  isMuted,
  agentSpeaking,
  userSpeaking,
  onStartCall,
  chatTyping = false,
}: VoiceAgentStatusProps) {
  const { branding, panel, behavior, theme, audioVisualizer } = config;

  const isVoiceOperating = isActive || isLoading || ['connecting', 'connected', 'agent_speaking', 'user_listening', 'muted', 'permission_required'].includes(callState);
  const isChatOperating = chatTyping;

  const formatTime = (secCount: number) => {
    const m = Math.floor(secCount / 60).toString().padStart(2, '0');
    const s = (secCount % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getSubStatusText = () => {
    if (isMuted) return branding.muteLabel || 'Microphone muted';
    if (callState === 'ending') return branding.endLabel ? `${branding.endLabel}...` : 'Closing session';
    if (agentSpeaking) return 'Front Desk speaking';
    if (userSpeaking) return 'Listening to you...';
    return 'Front Desk listening';
  };

  const getDensitySpacing = () => {
    switch (theme.density) {
      case 'compact':
        return { gap: '8px', padding: '12px 0' };
      case 'spacious':
        return { gap: '20px', padding: '24px 0' };
      case 'comfortable':
      default:
        return { gap: '14px', padding: '16px 0' };
    }
  };

  const spacing = getDensitySpacing();

  const renderSpeakingVisualizer = () => {
    if (!audioVisualizer.enabled || audioVisualizer.type === 'none') {
      return null;
    }

    const size = audioVisualizer.size || 76;
    const color = audioVisualizer.color || 'var(--voice-widget-primary)';
    const speed = audioVisualizer.animationSpeed || 1;
    const intensity = audioVisualizer.intensity || 1;

    const containerStyle: React.CSSProperties = {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: agentSpeaking
        ? color
        : userSpeaking
        ? 'var(--voice-widget-wave-user, #22C55E)'
        : 'rgba(14,27,42,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      position: 'relative',
      transition: 'background-color 0.4s ease, transform 0.4s ease',
    };

    if (audioVisualizer.type === 'pulse') {
      return (
        <div
          style={{
            ...containerStyle,
            animation: agentSpeaking
              ? `pulseAgentSpeaking ${1.2 / speed}s infinite`
              : userSpeaking
              ? `pulseUserSpeaking ${1.2 / speed}s infinite`
              : 'none',
          }}
        >
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
      );
    }

    if (audioVisualizer.type === 'orb') {
      const isSpeaking = agentSpeaking || userSpeaking;
      return (
        <div
          style={{
            ...containerStyle,
            background: isSpeaking
              ? `radial-gradient(circle, ${color} 0%, rgba(14,27,42,0.1) 70%)`
              : 'rgba(14,27,42,0.15)',
            boxShadow: isSpeaking
              ? `0 0 ${20 * intensity}px ${color}`
              : 'none',
            animation: isSpeaking ? `spin ${4 / speed}s linear infinite` : 'none',
          }}
        >
          <div
            style={{
              width: `${size * 0.7}px`,
              height: `${size * 0.7}px`,
              borderRadius: '50%',
              background: isSpeaking ? color : 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isSpeaking ? 'inset 0 0 12px rgba(255,255,255,0.4)' : 'none',
            }}
          >
            {agentSpeaking ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 10v4M6 6v12M9 4v16M12 7v10M15 5v14M18 8v8M21 10v4" />
              </svg>
            ) : userSpeaking ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
              </svg>
            ) : (
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white' }} />
            )}
          </div>
        </div>
      );
    }

    if (audioVisualizer.type === 'waveform' || audioVisualizer.type === 'bars') {
      const isSpeaking = agentSpeaking || userSpeaking;
      const barColor = agentSpeaking ? color : 'var(--voice-widget-wave-user, #22C55E)';
      return (
        <div
          style={{
            ...containerStyle,
            background: 'transparent',
            border: `2px solid ${isSpeaking ? barColor : 'rgba(14,27,42,0.12)'}`,
            display: 'flex',
            gap: '4px',
            padding: '8px',
          }}
        >
          <div style={{ display: 'flex', gap: '4px', height: '60%', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            {[0.1, 0.3, 0.2, 0.4, 0.15].map((delay, idx) => (
              <div
                key={idx}
                className="widget-wave-bar"
                style={{
                  width: '3px',
                  height: '100%',
                  background: isSpeaking ? barColor : 'rgba(14,27,42,0.4)',
                  animationName: isSpeaking ? 'waveScale' : 'none',
                  animationDuration: `${0.8 / speed}s`,
                  animationTimingFunction: 'ease-in-out',
                  animationIterationCount: 'infinite',
                  animationDelay: `${delay}s`,
                }}
              />
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center', gap: spacing.gap }}>
      {/* Tab Selector - ALWAYS visible and clickable so user can freely switch between voice & chat */}
      {panel.showTabs && behavior.allowTextChat && behavior.allowVoiceChat && (
        <div
          style={{
            display: 'flex',
            background: '#F1F5F9',
            padding: '3px',
            borderRadius: '10px',
            width: '100%',
            maxWidth: config.mode === 'inline' ? '260px' : '100%',
            marginBottom: '4px',
            border: '1px solid #E2E8F0',
          }}
        >
          <button
            type="button"
            onClick={() => onTabChange('text')}
            title="Switch to Text Chat"
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: '8px',
              background: activeTab === 'text' ? '#FFFFFF' : 'transparent',
              border: 'none',
              color: activeTab === 'text' ? '#0F172A' : '#64748B',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              opacity: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: activeTab === 'text' ? '0 1px 4px rgba(14,27,42,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Text Chat</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('voice')}
            title="Switch to Voice Agent"
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: '8px',
              background: activeTab === 'voice' ? '#FFFFFF' : 'transparent',
              border: 'none',
              color: activeTab === 'voice' ? '#0F172A' : '#64748B',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              opacity: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: activeTab === 'voice' ? '0 1px 4px rgba(14,27,42,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            </svg>
            <span>Voice Agent</span>
          </button>
        </div>
      )}

      {/* Connecting & Microphone permissions */}
      {isLoading && activeTab === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: spacing.padding, textAlign: 'center', width: '100%' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'var(--voice-widget-accent, #D9714B)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              animation: 'pulseConnecting 1.5s infinite',
            }}
          >
            <svg style={{ width: '28px', height: '28px', animation: 'spin 1.5s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" strokeDasharray="38 12" strokeDashoffset="0" />
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 6px', color: 'var(--voice-widget-text)' }}>
              {branding.connectingLabel}
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--voice-widget-text-muted)', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>
              {callState === 'permission_required' ? 'Please allow microphone access when prompted...' : 'Connecting securely...'}
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {callState === 'error' && activeTab === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: spacing.padding, textAlign: 'center', width: '100%' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EF4444',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px', color: '#EF4444' }}>
              {branding.errorMessage || 'Connection Failed'}
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--voice-widget-text-muted)', margin: 0, lineHeight: 1.5, maxWidth: '260px' }}>
              {errorMessage || 'Unable to start the voice assistant. Please try again.'}
            </p>
          </div>
          <button
            onClick={onStartCall}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              background: 'var(--voice-widget-primary, #2F8FE0)',
              border: 'none',
              color: 'white',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--voice-widget-shadow)',
            }}
          >
            {branding.retryLabel}
          </button>
        </div>
      )}

      {/* Ended State */}
      {callState === 'ended' && activeTab === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: spacing.padding, textAlign: 'center', width: '100%' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22C55E',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px', color: 'var(--voice-widget-text)' }}>
              {branding.callEndedMessage || 'Call Ended'}
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--voice-widget-text-muted)', margin: 0, lineHeight: 1.5 }}>
              Thank you for calling.
            </p>
          </div>
        </div>
      )}

      {/* Idle State / Intro */}
      {callState === 'idle' && activeTab === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: spacing.padding, textAlign: 'center', width: '100%' }}>
          {config.mode === 'inline' && (
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'var(--voice-widget-primary, #2F8FE0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: 'var(--voice-widget-shadow)',
                animation: 'pulseRing 2s infinite',
              }}
            >
              <svg
                width={28}
                height={28}
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {PHONE_PATH.map((p, i) => (
                  <path key={i} d={p} />
                ))}
              </svg>
            </div>
          )}
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px', color: 'var(--voice-widget-text)' }}>
              {branding.title}
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--voice-widget-text-muted)', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>
              {branding.subtitle}
            </p>
          </div>
          <button
            onClick={onStartCall}
            style={{
              padding: '12px 24px',
              borderRadius: '10px',
              background: 'var(--voice-widget-primary, #2F8FE0)',
              color: 'white',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--voice-widget-shadow)',
              transition: 'all 0.25s ease',
            }}
          >
            {branding.startLabel}
          </button>
        </div>
      )}

      {/* Connected / Active call status */}
      {isActive && activeTab === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
          {/* Speaking indicator and avatar */}
          {behavior.showAgentStatus && renderSpeakingVisualizer()}

          {behavior.showAgentStatus && (
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 4px', color: 'var(--voice-widget-text)' }}>
                {callState === 'ending' ? (branding.endLabel ? `${branding.endLabel}...` : 'Ending...') : branding.connectedLabel}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--voice-widget-text-muted)', margin: 0 }}>
                {getSubStatusText()}
              </p>
            </div>
          )}

          {/* Wave and Timer row if enabled */}
          {(behavior.showWaveform || behavior.showDuration) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(14, 27, 42, 0.03)',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(14, 27, 42, 0.05)',
                width: '100%',
              }}
            >
              {/* Timer */}
              {behavior.showDuration ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E', animation: 'pulseConnecting 1.5s infinite' }} />
                  <span style={{ fontSize: '13.5px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--voice-widget-text)' }}>
                    {formatTime(duration)}
                  </span>
                </div>
              ) : (
                <div />
              )}

              {/* Wave visualizer bars */}
              {behavior.showWaveform && (
                <div style={{ display: 'flex', gap: '3px', height: '18px', alignItems: 'center' }}>
                  <div
                    className="widget-wave-bar"
                    style={{
                      height: '100%',
                      background: agentSpeaking ? 'var(--voice-widget-primary)' : userSpeaking ? 'var(--voice-widget-wave-user)' : 'rgba(14,27,42,0.2)',
                      animationName: agentSpeaking || userSpeaking ? 'waveScale' : 'none',
                      animationDuration: '0.7s',
                      animationTimingFunction: 'ease-in-out',
                      animationIterationCount: 'infinite',
                      animationDelay: '0.1s',
                    }}
                  />
                  <div
                    className="widget-wave-bar"
                    style={{
                      height: '100%',
                      background: agentSpeaking ? 'var(--voice-widget-primary)' : userSpeaking ? 'var(--voice-widget-wave-user)' : 'rgba(14,27,42,0.2)',
                      animationName: agentSpeaking || userSpeaking ? 'waveScale' : 'none',
                      animationDuration: '0.7s',
                      animationTimingFunction: 'ease-in-out',
                      animationIterationCount: 'infinite',
                      animationDelay: '0.3s',
                    }}
                  />
                  <div
                    className="widget-wave-bar"
                    style={{
                      height: '100%',
                      background: agentSpeaking ? 'var(--voice-widget-primary)' : userSpeaking ? 'var(--voice-widget-wave-user)' : 'rgba(14,27,42,0.2)',
                      animationName: agentSpeaking || userSpeaking ? 'waveScale' : 'none',
                      animationDuration: '0.7s',
                      animationTimingFunction: 'ease-in-out',
                      animationIterationCount: 'infinite',
                      animationDelay: '0.2s',
                    }}
                  />
                  <div
                    className="widget-wave-bar"
                    style={{
                      height: '100%',
                      background: agentSpeaking ? 'var(--voice-widget-primary)' : userSpeaking ? 'var(--voice-widget-wave-user)' : 'rgba(14,27,42,0.2)',
                      animationName: agentSpeaking || userSpeaking ? 'waveScale' : 'none',
                      animationDuration: '0.7s',
                      animationTimingFunction: 'ease-in-out',
                      animationIterationCount: 'infinite',
                      animationDelay: '0.4s',
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
