import React from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';

export type CallState =
  | 'idle'
  | 'permission_required'
  | 'connecting'
  | 'connected'
  | 'agent_speaking'
  | 'user_listening'
  | 'muted'
  | 'ended'
  | 'error';

interface VoiceAgentStatusProps {
  config: VoiceWidgetConfig;
  callState: CallState;
  agentSpeaking: boolean;
  userSpeaking: boolean;
  callDuration: number;
  formatDuration: (sec: number) => string;
  errorMessage: string | null;
  activeTab: 'voice' | 'text';
  setActiveTab: (tab: 'voice' | 'text') => void;
  tabCount?: number;
}

export default function VoiceAgentStatus({
  config,
  callState,
  agentSpeaking,
  userSpeaking,
  callDuration,
  formatDuration,
  errorMessage,
  activeTab,
  setActiveTab,
  tabCount = 0,
}: VoiceAgentStatusProps) {
  const { branding, behavior, panel, theme } = config;
  const spacing = config.spacing || { padding: '16px', gap: '12px' };

  // Status text based on state
  const getStatusText = () => {
    if (callState === 'permission_required') return 'Requesting microphone permission...';
    if (callState === 'connecting') return 'Connecting securely...';
    if (callState === 'ended') return 'Call ended';
    if (callState === 'error') return errorMessage || 'Connection issue. Please try again.';
    if (callState === 'muted') return 'Microphone muted';
    if (agentSpeaking) return 'Front Desk speaking';
    if (userSpeaking) return 'Listening to you...';
    return 'Front Desk listening';
  };

  // Status badge indicator
  const getStatusDotColor = () => {
    if (callState === 'permission_required' || callState === 'connecting') return '#F59E0B'; // Amber
    if (callState === 'error') return '#EF4444'; // Red
    if (callState === 'ended') return '#9CA3AF'; // Gray
    if (agentSpeaking) return 'var(--voice-widget-primary)';
    if (userSpeaking) return 'var(--voice-widget-wave-user, #10B981)';
    return '#10B981'; // Green (Connected/Listening)
  };

  // Render Visualizer Type
  const renderVisualizer = () => {
    const visualizerType = behavior.visualizerType || 'wave';
    const isSpeaking = agentSpeaking || userSpeaking;
    const barColor = agentSpeaking ? 'var(--voice-widget-primary)' : 'var(--voice-widget-wave-user, #10B981)';
    const speed = behavior.animationSpeedMultiplier || 1.0;

    if (visualizerType === 'pulsing-circle') {
      return (
        <div style={{ position: 'relative', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isSpeaking && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: barColor,
                opacity: 0.25,
                animationName: 'pulseCircle',
                animationDuration: `${1.4 / speed}s`,
                animationTimingFunction: 'ease-out',
                animationIterationCount: 'infinite',
              }}
            />
          )}
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: isSpeaking ? barColor : 'var(--voice-widget-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: isSpeaking ? `0 0 16px ${barColor}` : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </div>
        </div>
      );
    }

    if (visualizerType === 'waveform-bars') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '36px', padding: '0 8px' }}>
          {[0.4, 0.8, 1.2, 0.6, 0.9, 1.4, 0.7, 1.1, 0.5].map((scale, i) => (
            <div
              key={i}
              className="widget-wave-bar"
              style={{
                width: '3px',
                height: '100%',
                background: isSpeaking ? barColor : 'rgba(14,27,42,0.2)',
                borderRadius: '2px',
                animationName: isSpeaking ? 'waveScale' : 'none',
                animationDuration: `${(0.6 + (i % 3) * 0.15) / speed}s`,
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
                animationDelay: `${i * 0.08}s`,
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>
      );
    }

    if (visualizerType === 'minimal-dot') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isSpeaking ? barColor : 'rgba(14,27,42,0.2)',
                animationName: isSpeaking ? 'bounceDot' : 'none',
                animationDuration: `${0.8 / speed}s`,
                animationTimingFunction: 'easeInOut',
                animationIterationCount: 'infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      );
    }

    if (visualizerType === 'orb') {
      return (
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: isSpeaking
              ? `radial-gradient(circle, ${barColor} 0%, rgba(47,143,224,0.2) 70%)`
              : 'radial-gradient(circle, rgba(14,27,42,0.15) 0%, transparent 70%)',
            animationName: isSpeaking ? 'orbGlow' : 'none',
            animationDuration: `${1.2 / speed}s`,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: isSpeaking ? barColor : '#94A3B8' }} />
        </div>
      );
    }

    // Default: 'wave' inside circular aura
    if (visualizerType === 'wave') {
      return (
        <div
          style={{
            position: 'relative',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: isSpeaking ? 'rgba(47,143,224,0.08)' : 'rgba(14,27,42,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: isSpeaking ? '1.5px solid rgba(47,143,224,0.25)' : '1px solid rgba(14,27,42,0.08)',
            transition: 'all 0.25s ease',
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
      {/* Tab Selector - Only show when callState is 'idle' and text chat is allowed */}
      {callState === 'idle' && panel.showTabs && behavior.allowTextChat && (
        <div
          style={{
            display: 'flex',
            width: '100%',
            background: 'var(--voice-widget-bg-tab, rgba(14, 27, 42, 0.05))',
            borderRadius: '12px',
            padding: '3px',
            boxSizing: 'border-box',
          }}
        >
          <button
            onClick={() => setActiveTab('voice')}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'voice' ? 'var(--voice-widget-bg-panel, #FFFFFF)' : 'transparent',
              color: activeTab === 'voice' ? 'var(--voice-widget-primary)' : 'var(--voice-widget-text-muted)',
              fontWeight: activeTab === 'voice' ? 700 : 500,
              fontSize: 'var(--voice-widget-font-xs)',
              boxShadow: activeTab === 'voice' ? '0 1px 4px rgba(14,27,42,0.08)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
            Voice Call
          </button>
          <button
            onClick={() => setActiveTab('text')}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'text' ? 'var(--voice-widget-bg-panel, #FFFFFF)' : 'transparent',
              color: activeTab === 'text' ? 'var(--voice-widget-primary)' : 'var(--voice-widget-text-muted)',
              fontWeight: activeTab === 'text' ? 700 : 500,
              fontSize: 'var(--voice-widget-font-xs)',
              boxShadow: activeTab === 'text' ? '0 1px 4px rgba(14,27,42,0.08)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Text Chat
          </button>
        </div>
      )}

      {/* Hero Welcome / Calling State Area */}
      {callState === 'idle' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%', gap: '8px' }}>
          {/* Avatar Icon */}
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'var(--voice-widget-bg-avatar, rgba(47,143,224,0.1))',
              border: '1.5px solid rgba(47,143,224,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--voice-widget-primary)',
              flexShrink: 0,
            }}
          >
            {branding.avatarUrl ? (
              <img
                src={branding.avatarUrl}
                alt={branding.assistantName}
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: 'var(--voice-widget-font-base)',
                fontWeight: 'var(--voice-widget-font-weight-heading)',
                color: 'var(--voice-widget-text)',
                lineHeight: '1.3',
              }}
            >
              {branding.assistantName}
            </span>
            {branding.subtitle && (
              <span
                style={{
                  fontSize: 'var(--voice-widget-font-xs)',
                  color: 'var(--voice-widget-text-muted)',
                  lineHeight: '1.4',
                  maxWidth: '240px',
                }}
              >
                {branding.subtitle}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* In-Call Active State */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '10px' }}>
          {/* Animated Visualizer */}
          {renderVisualizer()}

          {/* Call Status Label & Duration Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: getStatusDotColor(),
                display: 'inline-block',
                boxShadow: `0 0 0 2px ${getStatusDotColor()}33`,
                transition: 'background 0.3s ease',
              }}
            />
            <span
              style={{
                fontSize: 'var(--voice-widget-font-xs)',
                fontWeight: 600,
                color: callState === 'error' ? 'var(--voice-widget-error, #EF4444)' : 'var(--voice-widget-text)',
                letterSpacing: '0.01em',
              }}
            >
              {getStatusText()}
            </span>
          </div>

          {/* Duration Indicator */}
          {['connected', 'agent_speaking', 'user_listening', 'muted'].includes(callState) && (
            <span
              style={{
                fontSize: 'var(--voice-widget-font-xs)',
                fontWeight: 500,
                color: 'var(--voice-widget-text-muted)',
                fontFamily: 'monospace',
                background: 'rgba(14,27,42,0.04)',
                padding: '2px 8px',
                borderRadius: '6px',
              }}
            >
              {formatDuration(callDuration)}
            </span>
          )}

          {/* Error Message Box */}
          {callState === 'error' && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: 'var(--voice-widget-font-xs)',
                color: '#DC2626',
                textAlign: 'center',
                maxWidth: '90%',
                lineHeight: '1.4',
              }}
            >
              {errorMessage || 'Unable to establish call. Please try again.'}
            </div>
          )}

          {/* Active Speaking Status Bar */}
          {['connected', 'agent_speaking', 'user_listening', 'muted'].includes(callState) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '6px 12px',
                background: 'var(--voice-widget-bg-status, rgba(14,27,42,0.03))',
                borderRadius: '10px',
                border: '1px solid var(--voice-widget-border)',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: agentSpeaking ? 'var(--voice-widget-primary)' : userSpeaking ? 'var(--voice-widget-wave-user, #10B981)' : '#94A3B8',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--voice-widget-text)' }}>
                  {agentSpeaking ? 'Speaking' : userSpeaking ? 'Listening' : 'Ready'}
                </span>
              </div>

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
