import React from 'react';
import { CallState, VoiceWidgetConfig } from '@/config/voiceWidget/types';

interface VoiceAgentControlsProps {
  config: VoiceWidgetConfig;
  activeTab: 'voice' | 'text';
  callState: CallState;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onStopCall: () => void;
  chatInput: string;
  onChatInputChange: (val: string) => void;
  onSendChatMessage: (e: React.FormEvent) => void;
  chatTyping: boolean;
  onSwitchToVoice?: () => void;
}

const MIC_ON_PATH = [
  'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z',
  'M19 10v1a7 7 0 0 1-14 0v-1',
  'M12 18v4',
  'M8 22h8'
];

const MIC_OFF_PATH = [
  'M1 1l22 22',
  'M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6',
  'M17 11a7 7 0 0 1-1.16 3.88',
  'M8 5a7 7 0 0 0-3 5v1a7 7 0 0 0 1.25 3.93',
  'M12 18v4',
  'M8 22h8'
];

const HANGUP_PATH = [
  'M10.68 22.25a6 6 0 0 1-8-3.56C.85 14.5.85 9.5 2.68 5.31a6 6 0 0 1 8-3.56l2.12 1a2 2 0 0 1 1.09 2.54l-1.5 4.5a2 2 0 0 1-2.28 1.3l-2.4-.48a12.06 12.06 0 0 0 5.36 5.36l-.48-2.4a2 2 0 0 1 1.3-2.28l4.5-1.5a2 2 0 0 1 2.54 1.09l1 2.12a6 6 0 0 1-3.56 8z'
];

const SEND_PATH = ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'];

export default function VoiceAgentControls({
  config,
  activeTab,
  callState,
  isActive,
  isMuted,
  onToggleMute,
  onStopCall,
  chatInput,
  onChatInputChange,
  onSendChatMessage,
  chatTyping,
  onSwitchToVoice,
}: VoiceAgentControlsProps) {
  const { branding, behavior } = config;

  if (activeTab === 'text') {
    return (
      <form
        onSubmit={onSendChatMessage}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          marginTop: '6px',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '24px',
          padding: '4px 6px 4px 14px',
          boxShadow: '0 1px 4px rgba(14,27,42,0.04)',
          boxSizing: 'border-box',
        }}
      >
        <input
          type="text"
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          placeholder={branding.placeholderText || "Ask a question or say 'navigate to...'"}
          disabled={chatTyping}
          style={{
            flex: 1,
            padding: '8px 0',
            border: 'none',
            outline: 'none',
            fontSize: '13px',
            color: 'var(--voice-widget-text, #0F172A)',
            background: 'transparent',
          }}
        />
        {onSwitchToVoice && (
          <button
            type="button"
            onClick={onSwitchToVoice}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#F1F5F9',
              color: '#64748B',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title="Switch to Voice Agent"
            aria-label="Switch to Voice Agent"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>
        )}
        <button
          type="submit"
          disabled={chatTyping || !chatInput.trim()}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: chatInput.trim() && !chatTyping ? 'var(--voice-widget-primary, #2F8FE0)' : '#E2E8F0',
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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            {SEND_PATH.map((p, i) => (
              <path key={i} d={p} />
            ))}
          </svg>
        </button>
      </form>
    );
  }

  // Voice Chat Controls
  if (!isActive) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        width: '100%',
        marginTop: '16px',
      }}
    >
      {behavior.showMuteButton && (
        <button
          onClick={onToggleMute}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: isMuted ? 'var(--voice-widget-bg-mute-active, rgba(239, 68, 68, 0.1))' : 'rgba(14,27,42,0.06)',
            color: isMuted ? 'var(--voice-widget-error, #EF4444)' : 'var(--voice-widget-text)',
            border: isMuted ? '1px solid rgba(239,68,68,0.2)' : '1px solid transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          title={isMuted ? branding.unmuteLabel : branding.muteLabel}
          aria-label={isMuted ? branding.unmuteLabel : branding.muteLabel}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {(isMuted ? MIC_OFF_PATH : MIC_ON_PATH).map((p, i) => (
              <path key={i} d={p} />
            ))}
          </svg>
        </button>
      )}

      {behavior.showEndButton && (
        <button
          onClick={onStopCall}
          disabled={callState === 'ending'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '11px 20px',
            borderRadius: '24px',
            background: 'var(--voice-widget-error, #EF4444)',
            color: 'white',
            border: 'none',
            fontSize: 'var(--voice-widget-font-sm)',
            fontWeight: 'var(--voice-widget-font-weight-heading)',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
            transition: 'all 0.2s ease',
            opacity: callState === 'ending' ? 0.7 : 1,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: 'rotate(135deg)', display: 'inline-block', verticalAlign: 'middle' }}
          >
            {HANGUP_PATH.map((p, i) => (
              <path key={i} d={p} />
            ))}
          </svg>
          <span>{branding.endLabel}</span>
        </button>
      )}
    </div>
  );
}
