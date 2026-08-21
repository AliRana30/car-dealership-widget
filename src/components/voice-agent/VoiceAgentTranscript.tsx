import React from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import type { WebsiteDataResult } from './IntelligenceResultCard';

export interface TranscriptMessage {
  role: 'user' | 'agent';
  content: string;
  /** Structured data results from the Website Intelligence system */
  results?: WebsiteDataResult[];
}

interface VoiceAgentTranscriptProps {
  config: VoiceWidgetConfig;
  activeTab: 'voice' | 'text';
  chatMessages: TranscriptMessage[];
  chatTyping: boolean;
  transcript: TranscriptMessage[];
  transcriptEndRef: React.RefObject<HTMLDivElement | null>;
  parseStatusMessage: (content: string) => { isStatus: boolean; text: string; statusType: string };
  onSelectTemplateMessage?: (message: string) => void;
}

function renderBoldAndText(text: string, keyPrefix: string): React.ReactNode {
  const boldRegex = /\*\*([^*]+)\*\*/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.substring(lastIndex, match.index));
    }
    nodes.push(
      <strong key={`b-${keyPrefix}-${match.index}`} style={{ fontWeight: 600 }}>
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}

function renderFormattedContent(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');

  return lines.map((line, lineIdx) => {
    // Check if line contains markdown links [label](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(renderBoldAndText(line.substring(lastIndex, match.index), `${lineIdx}-${lastIndex}`));
      }
      const label = match[1];
      const url = match[2];
      parts.push(
        <a
          key={`link-${lineIdx}-${match.index}`}
          href={url}
          style={{
            color: 'var(--voice-widget-primary, #2F8FE0)',
            textDecoration: 'underline',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.preventDefault();
            // Always navigate the host/parent page — never open a new tab
            if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
              try {
                window.parent.postMessage({ type: 'voice-agent-navigate', url }, '*');
                window.parent.postMessage({ type: 'WIDGET_NAVIGATE', url }, '*');
              } catch (_) {}
            } else if (typeof window !== 'undefined') {
              window.location.href = url;
            }
          }}
        >
          {label}
        </a>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      parts.push(renderBoldAndText(line.substring(lastIndex), `${lineIdx}-${lastIndex}`));
    }

    return (
      <span key={`line-${lineIdx}`} style={{ display: 'block', minHeight: line.trim() === '' ? '6px' : undefined }}>
        {parts.length > 0 ? parts : ' '}
      </span>
    );
  });
}

export default function VoiceAgentTranscript({
  config,
  activeTab,
  chatMessages,
  chatTyping,
  transcript,
  transcriptEndRef,
  parseStatusMessage,
  onSelectTemplateMessage,
}: VoiceAgentTranscriptProps) {
  const { branding, behavior } = config;

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
          const isNavConfirm = msg.role === 'agent' && (
            msg.content.toLowerCase().startsWith('navigated to') ||
            msg.content.toLowerCase().startsWith('opening the page') ||
            msg.content.toLowerCase().startsWith('opening our')
          );

          // Extract navigated target name if present
          let navTarget = '';
          if (isNavConfirm) {
            const m = msg.content.match(/(?:navigated to|opening the page for|opening our)\s+([^.]+)/i);
            if (m) navTarget = m[1].replace(/\*\*/g, '').trim();
          }

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                width: '100%',
                gap: '3px',
              }}
            >
              {/* Chat bubble */}
              {msg.content && (
                <div
                  style={{
                    maxWidth: '85%',
                    background: isUser
                      ? 'var(--voice-widget-bg-user-bubble, var(--voice-widget-primary, #2F8FE0))'
                      : 'var(--voice-widget-bg-agent-bubble, #F8FAFC)',
                    color: isUser
                      ? 'var(--voice-widget-text-user-bubble, #0F172A)'
                      : 'var(--voice-widget-text, #0F172A)',
                    border: isUser ? 'none' : '1px solid var(--voice-widget-border, #E2E8F0)',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    lineHeight: '1.5',
                    boxShadow: '0 1px 3px rgba(14,27,42,0.03)',
                  }}
                >
                  {renderFormattedContent(msg.content)}
                </div>
              )}
            </div>
          );
        })}

        {/* Quick-action Template Message / Starter Prompt Chips */}
        {behavior.templateMessages && behavior.templateMessages.length > 0 && chatMessages.length <= 2 && !chatTyping && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--voice-widget-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Suggested Inquiries:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {behavior.templateMessages.map((t) => {
                // Strip leading emoji/generic icons from label
                const cleanLabel = (t.label || t.message || '').replace(/^[\p{Emoji}\u200d\uFE0F\s]+/u, '').trim();
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTemplateMessage && onSelectTemplateMessage(t.message)}
                    style={{
                      background: 'var(--voice-widget-bg-card, #FFFFFF)',
                      color: 'var(--voice-widget-primary, #2F8FE0)',
                      border: '1px solid var(--voice-widget-border, #E2E8F0)',
                      borderRadius: '16px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      textAlign: 'left',
                      boxShadow: '0 1px 3px rgba(14,27,42,0.04)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--voice-widget-primary, #2F8FE0)';
                      e.currentTarget.style.background = 'rgba(47, 143, 224, 0.08)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--voice-widget-border, #E2E8F0)';
                      e.currentTarget.style.background = 'var(--voice-widget-bg-card, #FFFFFF)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <span>{cleanLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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

  // ── Voice Chat Transcript Panel ────────────────────────────────────────────
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
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: 'var(--voice-widget-font-sm)', lineHeight: 'var(--voice-widget-line-height)' }}>
                  <span
                    style={{
                      fontWeight: 'var(--voice-widget-font-weight-heading)',
                      color: isUser ? 'var(--voice-widget-wave-user, #22C55E)' : 'var(--voice-widget-primary, #2F8FE0)',
                    }}
                  >
                    {isUser ? (branding.userMessageName || 'You') : (branding.agentMessageName || branding.assistantName || 'Agent')}:
                  </span>{' '}
                  <span style={{ color: 'var(--voice-widget-text)', fontWeight: 'var(--voice-widget-font-weight-body)' }}>
                    {renderFormattedContent(msg.content)}
                  </span>
                </div>
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

// ── Lazy-loaded result card (avoids direct dep cycle) ─────────────────────────

function LazyResultCard({ result }: { result: WebsiteDataResult }) {
  const [Card, setCard] = React.useState<React.ComponentType<{ result: WebsiteDataResult; primaryColor?: string }> | null>(null);

  React.useEffect(() => {
    import('./IntelligenceResultCard').then((mod) => {
      setCard(() => mod.default);
    });
  }, []);

  if (!Card) return null;
  return <Card result={result} primaryColor="var(--voice-widget-primary, #2F8FE0)" />;
}
