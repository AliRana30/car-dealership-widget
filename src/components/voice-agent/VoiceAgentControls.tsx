import React from 'react';
import { CallState, VoiceWidgetConfig } from '@/config/voiceWidget/types';

interface VoiceAgentControlsProps {
  config: VoiceWidgetConfig;
  activeTab?: 'voice' | 'text';
  callState: CallState;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onStartCall: () => void;
  onStopCall: () => void;
  chatInput: string;
  onChatInputChange: (val: string) => void;
  onSendChatMessage: (e: React.FormEvent) => void;
  chatTyping: boolean;
  onSwitchToVoice?: () => void;
}

export default function VoiceAgentControls({
  config,
  callState,
  isActive,
  isMuted,
  onToggleMute,
  onStartCall,
  onStopCall,
  chatInput,
  onChatInputChange,
  onSendChatMessage,
  chatTyping,
}: VoiceAgentControlsProps) {
  const { branding } = config;
  const isConnecting = ['connecting', 'permission_required'].includes(callState);
  const isEnding = callState === 'ending';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        marginTop: 'auto',
        paddingTop: '8px',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. Main Action Pill Button: Tap to Talk / End Call (Matching Image 4) */}
      {!isActive ? (
        <button
          type="button"
          onClick={onStartCall}
          disabled={isConnecting}
          style={{
            width: '100%',
            padding: '12px 18px',
            borderRadius: '999px',
            background: 'var(--voice-widget-primary, #2F8FE0)',
            color: '#FFFFFF',
            border: 'none',
            fontSize: '14px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: isConnecting ? 'wait' : 'pointer',
            boxShadow: '0 4px 14px rgba(37,99,235,0.22)',
            transition: 'transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
            opacity: isConnecting ? 0.8 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
          <span>{isConnecting ? (branding.connectingLabel || 'Connecting...') : (branding.startLabel || 'Tap to talk')}</span>
        </button>
      ) : (
        /* Active Call Controls Row */
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
          {/* Mute Button */}
          <button
            type="button"
            onClick={onToggleMute}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: isMuted ? 'rgba(239, 68, 68, 0.12)' : 'rgba(14,27,42,0.06)',
              color: isMuted ? '#EF4444' : '#0F172A',
              border: isMuted ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            title={isMuted ? 'Unmute' : 'Mute'}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isMuted ? (
                <path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6M17 11a7 7 0 0 1-1.16 3.88M8 5a7 7 0 0 0-3 5v1a7 7 0 0 0 1.25 3.93M12 18v4M8 22h8" />
              ) : (
                <>
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </>
              )}
            </svg>
          </button>

          {/* End Call Button */}
          <button
            type="button"
            onClick={onStopCall}
            disabled={isEnding}
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: '999px',
              background: '#EF4444',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '13.5px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: isEnding ? 'default' : 'pointer',
              boxShadow: '0 3px 10px rgba(239, 68, 68, 0.25)',
              opacity: isEnding ? 0.7 : 1,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              style={{ transform: 'rotate(135deg)' }}
            >
              <path d="M10.68 22.25a6 6 0 0 1-8-3.56C.85 14.5.85 9.5 2.68 5.31a6 6 0 0 1 8-3.56l2.12 1a2 2 0 0 1 1.09 2.54l-1.5 4.5a2 2 0 0 1-2.28 1.3l-2.4-.48a12.06 12.06 0 0 0 5.36 5.36l-.48-2.4a2 2 0 0 1 1.3-2.28l4.5-1.5a2 2 0 0 1 2.54 1.09l1 2.12a6 6 0 0 1-3.56 8z" />
            </svg>
            <span>{isEnding ? 'Ending...' : (branding.endLabel || 'End Call')}</span>
          </button>
        </div>
      )}

      {/* 2. Text Input Row: "Type a message instead..." (Matching Image 4) */}
      <form
        onSubmit={onSendChatMessage}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          background: 'rgba(14, 27, 42, 0.03)',
          border: '1px solid var(--voice-widget-border, #E2E8F0)',
          borderRadius: '999px',
          padding: '3px 4px 3px 14px',
          boxSizing: 'border-box',
        }}
      >
        <input
          type="text"
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          placeholder={branding.placeholderText || "Type a message instead..."}
          disabled={chatTyping}
          style={{
            flex: 1,
            padding: '7px 0',
            border: 'none',
            outline: 'none',
            fontSize: '12.5px',
            color: 'var(--voice-widget-text, #0F172A)',
            background: 'transparent',
          }}
        />
        <button
          type="submit"
          disabled={chatTyping || !chatInput.trim()}
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: chatInput.trim() && !chatTyping ? 'var(--voice-widget-primary, #2F8FE0)' : 'rgba(14,27,42,0.1)',
            color: chatInput.trim() && !chatTyping ? '#FFFFFF' : '#94A3B8',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: chatInput.trim() && !chatTyping ? 'pointer' : 'default',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
          title="Send message"
          aria-label="Send message"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}
