import React from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';

export interface TranscriptMessage {
  role: 'user' | 'agent';
  content: string;
}

interface VoiceAgentTranscriptProps {
  config: VoiceWidgetConfig;
  activeTab: 'voice' | 'text';
  chatMessages: TranscriptMessage[];
  chatTyping: boolean;
  transcript: TranscriptMessage[];
  transcriptEndRef: React.RefObject<HTMLDivElement | null>;
  parseStatusMessage: (content: string) => { isStatus: boolean; text: string; statusType: string };
}

export default function VoiceAgentTranscript({
  config,
  activeTab,
  chatMessages,
  chatTyping,
  transcript,
  transcriptEndRef,
  parseStatusMessage,
}: VoiceAgentTranscriptProps) {
  const { branding, panel, behavior } = config;

  if (activeTab === 'text') {
    return (
      <div
        style={{
          flex: 1,
          background: 'var(--voice-widget-bg-transcript, rgba(14, 27, 42, 0.03))',
          border: '1px solid var(--voice-widget-border)',
          borderRadius: '16px',
          padding: '12px',
          overflowY: 'auto',
          maxHeight: config.mode === 'inline' ? '160px' : '260px',
          minHeight: config.mode === 'inline' ? '130px' : '220px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          textAlign: 'left',
          width: '100%',
        }}
      >
        {chatMessages.map((msg, idx) => {
          const statusInfo = parseStatusMessage(msg.content);
          if (statusInfo.isStatus) {
            let bgColor = 'rgba(47, 143, 224, 0.1)';
            let textColor = 'var(--voice-widget-primary, #2F8FE0)';
            let borderColor = 'rgba(47, 143, 224, 0.2)';

            const type = statusInfo.statusType;
            if (type.includes('success') || type.includes('booked') || type.includes('completed')) {
              bgColor = 'rgba(46, 204, 113, 0.1)';
              textColor = 'var(--voice-widget-success, #2ecc71)';
              borderColor = 'rgba(46, 204, 113, 0.2)';
            } else if (type.includes('fail') || type.includes('error') || type.includes('reject')) {
              bgColor = 'rgba(231, 76, 60, 0.1)';
              textColor = 'var(--voice-widget-error, #e74c3c)';
              borderColor = 'rgba(231, 76, 60, 0.2)';
            } else if (type.includes('transfer') || type.includes('redirect')) {
              bgColor = 'rgba(155, 89, 182, 0.1)';
              textColor = '#9b59b6';
              borderColor = 'rgba(155, 89, 182, 0.2)';
            } else if (
              type.includes('progress') ||
              type.includes('wait') ||
              type.includes('pend') ||
              type.includes('process') ||
              type.includes('look')
            ) {
              bgColor = 'rgba(241, 196, 15, 0.1)';
              textColor = 'var(--voice-widget-warning, #f1c40f)';
              borderColor = 'rgba(241, 196, 15, 0.2)';
            }

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  width: '100%',
                  margin: '6px 0',
                }}
              >
                <div
                  style={{
                    background: bgColor,
                    color: textColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: '12px',
                    padding: '8px 16px',
                    fontSize: 'var(--voice-widget-font-xs)',
                    fontWeight: 'var(--voice-widget-font-weight-heading)',
                    textAlign: 'center',
                    maxWidth: '90%',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    textTransform: 'capitalize',
                  }}
                >
                  {statusInfo.text}
                </div>
              </div>
            );
          }

          const isUser = msg.role === 'user';
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                width: '100%',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  background: isUser ? 'var(--voice-widget-bg-user-bubble, var(--voice-widget-primary))' : 'var(--voice-widget-bg-agent-bubble, #FFFFFF)',
                  color: isUser ? '#FFFFFF' : 'var(--voice-widget-text, #0E1B2A)',
                  border: isUser ? 'none' : '1px solid var(--voice-widget-border)',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  padding: '8px 12px',
                  fontSize: 'var(--voice-widget-font-sm)',
                  fontWeight: 'var(--voice-widget-font-weight-body)',
                  lineHeight: 'var(--voice-widget-line-height)',
                  boxShadow: '0 2px 6px rgba(14,27,42,0.03)',
                }}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
        {chatTyping && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
            <div
              style={{
                background: 'var(--voice-widget-bg-agent-bubble, #FFFFFF)',
                border: '1px solid var(--voice-widget-border)',
                borderRadius: '14px 14px 14px 2px',
                padding: '8px 12px',
                fontSize: 'var(--voice-widget-font-sm)',
                fontWeight: 'var(--voice-widget-font-weight-body)',
                color: 'var(--voice-widget-text-muted)',
                boxShadow: '0 2px 6px rgba(14,27,42,0.03)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>Agent is typing</span>
              <span style={{ animation: 'pulseConnecting 1.5s infinite', fontWeight: 'bold' }}>...</span>
            </div>
          </div>
        )}
        <div ref={transcriptEndRef} />
      </div>
    );
  }

  // Voice Chat Transcript Panel
  if (!behavior.showTranscript) return null;

  return (
    <div
      style={{
        flex: 1,
        background: 'var(--voice-widget-bg-transcript, rgba(14, 27, 42, 0.04))',
        borderRadius: '12px',
        padding: '14px',
        minHeight: config.mode === 'inline' ? '80px' : '110px',
        maxHeight: config.mode === 'inline' ? '120px' : '160px',
        overflowY: 'auto',
        border: '1px solid var(--voice-widget-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        textAlign: 'left',
      }}
    >
      {transcript && transcript.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {transcript.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div key={idx} style={{ fontSize: 'var(--voice-widget-font-sm)', lineHeight: 'var(--voice-widget-line-height)' }}>
                <span
                  style={{
                    fontWeight: 'var(--voice-widget-font-weight-heading)',
                    color: isUser ? 'var(--voice-widget-wave-user, #22C55E)' : 'var(--voice-widget-primary, #2F8FE0)',
                  }}
                >
                  {isUser ? branding.userMessageName : branding.agentMessageName}:
                </span>{' '}
                <span style={{ color: 'var(--voice-widget-text)', fontWeight: 'var(--voice-widget-font-weight-body)' }}>
                  {msg.content}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <span
          style={{
            color: 'var(--voice-widget-text-muted)',
            fontStyle: 'italic',
            fontSize: 'var(--voice-widget-font-xs)',
            textAlign: 'center',
            marginTop: config.mode === 'inline' ? '15px' : '40px',
          }}
        >
          {"Say \"Hello\" or ask a question to start..."}
        </span>
      )}
      <div ref={transcriptEndRef} />
    </div>
  );
}
