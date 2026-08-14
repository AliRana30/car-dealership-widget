import React, { useState } from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';

interface VoiceAgentHeaderProps {
  config: VoiceWidgetConfig;
  isActive: boolean;
  isLoading: boolean;
  onClose?: () => void;
  showClose: boolean;
}

const CLOSE_ICON_PATH = ['M18 6L6 18', 'M6 6l12 12'];

export default function VoiceAgentHeader({ config, isActive, isLoading, onClose, showClose }: VoiceAgentHeaderProps) {
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
    : 'rgba(14,27,42,0.2)';

  return (
    <div
      style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--voice-widget-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(14, 27, 42, 0.02)',
        fontFamily: config.typography.fontFamily,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--voice-widget-text)', lineHeight: 1.2 }}>
            {branding.assistantName}
          </span>
          {showAvatar && (
            <span style={{ fontSize: '11px', color: 'var(--voice-widget-text-muted)', marginTop: '2px' }}>
              {isActive ? 'Online' : 'Agent'}
            </span>
          )}
        </div>
      </div>
      {showClose && panel.showCloseButton && onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--voice-widget-text-muted)',
            display: 'flex',
            padding: '4px',
            opacity: 0.7,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
          title="Close panel"
          aria-label="Close panel"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'inline-block', verticalAlign: 'middle' }}
          >
            {CLOSE_ICON_PATH.map((p, i) => (
              <path key={i} d={p} />
            ))}
          </svg>
        </button>
      )}
    </div>
  );
}
