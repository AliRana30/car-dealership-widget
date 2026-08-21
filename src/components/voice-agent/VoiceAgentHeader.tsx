import React, { useState } from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';

interface VoiceAgentHeaderProps {
  config: VoiceWidgetConfig;
  isActive: boolean;
  isLoading: boolean;
  onClose?: () => void;
  showClose: boolean;
  onNewChat?: () => void;
  cardCount?: number;
  onToggleCards?: () => void;
  isCardsOpen?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

const CLOSE_ICON_PATH = ['M18 6L6 18', 'M6 6l12 12'];

export default function VoiceAgentHeader({
  config,
  isActive,
  isLoading,
  onClose,
  showClose,
  onNewChat,
  cardCount = 0,
  onToggleCards,
  isCardsOpen = true,
  isMuted = false,
  onToggleMute,
}: VoiceAgentHeaderProps) {
  const { branding, panel, avatar } = config;
  const [imageError, setImageError] = useState(false);

  if (!panel.showHeader) return null;

  // Compute avatar properties
  const showAvatar = avatar?.enabled;
  const avatarSize = avatar?.size || 36;
  const avatarShape = avatar?.shape || 'circle';

  let borderRadius = '50%';
  if (avatarShape === 'square') {
    borderRadius = '0px';
  } else if (avatarShape === 'rounded') {
    borderRadius = '6px';
  }

  const fallbackInitials = avatar?.fallbackText || branding.assistantName.substring(0, 2).toUpperCase();

  // Status dot background
  const statusColor = isActive
    ? 'var(--voice-widget-wave-user, #22C55E)'
    : isLoading
    ? 'var(--voice-widget-accent, #D9714B)'
    : '#22C55E';

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--voice-widget-border, #E2E8F0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#FFFFFF',
        fontFamily: config.typography.fontFamily,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {showAvatar ? (
          <div style={{ position: 'relative', width: `${avatarSize}px`, height: `${avatarSize}px` }}>
            {avatar.src && !imageError ? (
              <img
                src={avatar.src}
                alt={branding.assistantName}
                onError={() => setImageError(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius,
                  backgroundColor: 'rgba(14,27,42,0.05)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius,
                  backgroundColor: 'var(--voice-widget-primary, #2F8FE0)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `${avatarSize * 0.4}px`,
                  fontWeight: 700,
                }}
              >
                {fallbackInitials}
              </div>
            )}
            {/* Overlay status dot on bottom right */}
            <div
              style={{
                position: 'absolute',
                bottom: '-1px',
                right: '-1px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: statusColor,
                border: '2px solid var(--voice-widget-bg-panel, #ffffff)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                animation: isLoading ? 'pulseWidgetRing 1.5s infinite' : 'none',
              }}
            />
          </div>
        ) : (
          /* Default minimal indicator dot */
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: statusColor,
              animation: isLoading ? 'pulseWidgetRing 1.5s infinite' : 'none',
            }}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--voice-widget-text, #0F172A)', lineHeight: 1.2 }}>
            {branding.assistantName || 'AI Assistant'}
          </span>
          {branding.subtitle && (
            <span style={{ fontSize: '10.5px', color: 'var(--voice-widget-text-muted, #64748B)', marginTop: '2px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {branding.subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Right Header Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Sound toggle if audio active */}
        {onToggleMute && (
          <button
            type="button"
            onClick={onToggleMute}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isMuted ? '#EF4444' : '#64748B',
              padding: '4px 6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
            title={isMuted ? 'Unmute' : 'Mute'}
            aria-label="Toggle mute"
          >
            {isMuted ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
        )}

        {/* Cards (X) toggle pill button */}
        {cardCount > 0 && onToggleCards && (
          <button
            type="button"
            onClick={onToggleCards}
            style={{
              background: isCardsOpen ? '#ECFDF5' : '#F1F5F9',
              color: isCardsOpen ? '#059669' : '#64748B',
              border: `1px solid ${isCardsOpen ? '#A7F3D0' : '#E2E8F0'}`,
              borderRadius: '16px',
              padding: '3px 9px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease',
            }}
            title="Toggle recommended cards"
            aria-label="Toggle recommended cards"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span>Cards ({cardCount})</span>
          </button>
        )}

        {/* New Chat / Reload */}
        {onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
            }}
            title="Start new conversation"
            aria-label="Start new conversation"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
            </svg>
          </button>
        )}

        {/* Close Button */}
        {showClose && panel.showCloseButton && onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748B',
              display: 'flex',
              padding: '4px',
            }}
            title="Close panel"
            aria-label="Close panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {CLOSE_ICON_PATH.map((p, i) => (
                <path key={i} d={p} />
              ))}
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
