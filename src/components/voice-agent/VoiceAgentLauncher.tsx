import React, { useState } from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';

interface VoiceAgentLauncherProps {
  onClick: () => void;
  config: VoiceWidgetConfig;
  isOpen: boolean;
  isActive: boolean;
}

const PHONE_PATH = [
  'M6.6 4.2h3.4l1.3 5-2.5 1.6a12.4 12.4 0 0 0 5.9 5.9l1.6-2.5 5 1.3v3.4a2 2 0 0 1-2.1 2C10.7 20.2 3.8 13.3 3.1 5.9c-.1-1 .7-1.7 1.6-1.7z'
];

const MICROPHONE_PATH = [
  'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z',
  'M19 10v1a7 7 0 0 1-14 0v-1',
  'M12 18v4',
  'M8 22h8'
];

const CHAT_PATH = [
  'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'
];

const HEADSET_PATH = [
  'M3 18v-6a9 9 0 0 1 18 0v6',
  'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3',
  'M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3'
];

const SPARKLES_PATH = [
  'M12 3l1.912 3.874 4.276.621-3.094 3.016.73 4.259L12 14.758l-3.824 2.012.73-4.259-3.094-3.016 4.276-.621z'
];

export default function VoiceAgentLauncher({ onClick, config, isOpen, isActive }: VoiceAgentLauncherProps) {
  const { launcher } = config;
  const [imageError, setImageError] = useState(false);

  const renderIcon = (buttonSize: number) => {
    // If a logo is provided and hasn't failed to load, render the logo image
    if (launcher.logoSrc && !imageError) {
      const imgSize = Math.round(buttonSize * 0.45);
      return (
        <img
          src={launcher.logoSrc}
          alt=""
          onError={() => setImageError(true)}
          style={{
            width: `${imgSize}px`,
            height: `${imgSize}px`,
            objectFit: 'contain',
            borderRadius: launcher.shape === 'circle' ? '50%' : '4px',
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
        />
      );
    }

    let paths = PHONE_PATH;
    if (launcher.icon === 'microphone') {
      paths = MICROPHONE_PATH;
    } else if (launcher.icon === 'chat' || launcher.icon === 'message') {
      paths = CHAT_PATH;
    } else if (launcher.icon === 'headset') {
      paths = HEADSET_PATH;
    } else if (launcher.icon === 'sparkles') {
      paths = SPARKLES_PATH;
    } else if (launcher.icon === 'custom' && launcher.customIconPath) {
      paths = launcher.customIconPath;
    }

    return (
      <svg
        width={buttonSize * 0.4}
        height={buttonSize * 0.4}
        viewBox="0 0 24 24"
        fill="none"
        stroke={launcher.iconColor || 'white'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'inline-block', verticalAlign: 'middle' }}
      >
        {paths.map((p, i) => (
          <path key={i} d={p} />
        ))}
      </svg>
    );
  };

  const getContainerStyles = (): React.CSSProperties => {
    const styles: React.CSSProperties = {
      position: 'fixed',
      zIndex: launcher.zIndex ?? 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      pointerEvents: 'none',
      fontFamily: config.typography.fontFamily,
    };

    // Label position offsets (only if showing external label)
    if (launcher.label?.show && launcher.variant === 'icon') {
      const pos = launcher.label.position || 'left';
      if (pos === 'left') {
        styles.flexDirection = 'row-reverse';
      } else if (pos === 'right') {
        styles.flexDirection = 'row';
      } else if (pos === 'above') {
        styles.flexDirection = 'column-reverse';
      } else if (pos === 'below') {
        styles.flexDirection = 'column';
      }
    }

    const offset = launcher.offset || {};
    const pos = launcher.position || 'bottom-right';

    if (pos.startsWith('bottom')) {
      styles.bottom = offset.bottom !== undefined ? `${offset.bottom}px` : '24px';
    } else {
      styles.top = offset.top !== undefined ? `${offset.top}px` : '24px';
    }

    if (pos.endsWith('right')) {
      styles.right = offset.right !== undefined ? `${offset.right}px` : '24px';
    } else {
      styles.left = offset.left !== undefined ? `${offset.left}px` : '24px';
    }

    return styles;
  };

  const getLabelStyles = (): React.CSSProperties => {
    return {
      pointerEvents: 'auto',
      background: 'var(--voice-widget-bg-panel, #ffffff)',
      color: 'var(--voice-widget-text, #0E1B2A)',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: 'var(--voice-widget-font-sm, 13px)',
      fontWeight: 'var(--voice-widget-font-weight-heading, 600)',
      boxShadow: 'var(--voice-widget-shadow, 0 4px 12px rgba(14,27,42,0.15))',
      border: '1px solid var(--voice-widget-border, rgba(14,27,42,0.12))',
      whiteSpace: 'nowrap',
      transition: 'opacity 0.2s ease',
    };
  };

  let buttonSize = 56;
  if (typeof launcher.size === 'number') {
    buttonSize = launcher.size;
  } else if (launcher.size === 'small') {
    buttonSize = 44;
  } else if (launcher.size === 'medium') {
    buttonSize = 56;
  } else if (launcher.size === 'large') {
    buttonSize = 68;
  }

  let borderRadius = '50%';
  if (launcher.shape === 'square') {
    borderRadius = '0px';
  } else if (launcher.shape === 'rounded') {
    borderRadius = '12px';
  } else if (launcher.shape === 'pill') {
    borderRadius = '9999px';
  } else if (launcher.shape === 'circle') {
    borderRadius = '50%';
  }

  let shadowVal = '0 4px 12px rgba(14,27,42,0.15)';
  if (launcher.shadow === 'none') {
    shadowVal = 'none';
  } else if (launcher.shadow === 'subtle') {
    shadowVal = '0 2px 8px rgba(14,27,42,0.08)';
  } else if (launcher.shadow === 'medium') {
    shadowVal = '0 6px 16px rgba(14,27,42,0.15)';
  } else if (launcher.shadow === 'strong') {
    shadowVal = '0 12px 28px rgba(14,27,42,0.25)';
  }

  const borderVal = launcher.border?.enabled
    ? `${launcher.border.width || 1}px solid ${launcher.border.color || 'var(--voice-widget-border)'}`
    : 'none';

  // Determine button width and padding based on variant
  const isPill = launcher.variant === 'pill';
  const isIconLabel = launcher.variant === 'icon-label';
  const hasText = (isPill || isIconLabel) && launcher.label?.text;

  const buttonStyle: React.CSSProperties = {
    height: `${buttonSize}px`,
    borderRadius,
    background: isActive
      ? 'var(--voice-widget-wave-user, #22C55E)'
      : 'var(--voice-widget-bg-launcher, var(--voice-widget-primary, #2F8FE0))',
    border: borderVal,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadowVal,
    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    animation: isActive || !launcher.pulseAnimation ? 'none' : 'pulseWidgetRing 2s infinite',
    pointerEvents: 'auto',
    boxSizing: 'border-box',
    color: launcher.iconColor || 'white',
    fontSize: '14.5px',
    fontWeight: 600,
    outline: 'none',
  };

  if (hasText) {
    buttonStyle.padding = '0 20px';
    buttonStyle.width = 'auto';
    buttonStyle.minWidth = `${buttonSize}px`;
    buttonStyle.gap = '8px';
  } else {
    buttonStyle.width = `${buttonSize}px`;
  }

  return (
    <div
      className="voice-widget-launcher-container"
      style={getContainerStyles()}
    >
      <button
        className="voice-widget-launcher-btn"
        onClick={onClick}
        style={buttonStyle}
        title={launcher.tooltip}
        aria-label={launcher.ariaLabel}
      >
        {isActive ? (
          <div style={{ display: 'flex', gap: '3px', height: `${buttonSize * 0.33}px`, alignItems: 'center' }}>
            <div className="widget-wave-bar" style={{ width: '100%', background: 'white', animationName: 'waveScale', animationDuration: '0.6s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite', animationDelay: '0.1s' }} />
            <div className="widget-wave-bar" style={{ height: '100%', background: 'white', animationName: 'waveScale', animationDuration: '0.6s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite', animationDelay: '0.3s' }} />
            <div className="widget-wave-bar" style={{ height: '100%', background: 'white', animationName: 'waveScale', animationDuration: '0.6s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite', animationDelay: '0.2s' }} />
          </div>
        ) : (
          <>
            {!isPill && renderIcon(buttonSize)}
            {hasText && (
              <span className="voice-widget-launcher-text">
                {launcher.label.text}
              </span>
            )}
          </>
        )}
      </button>

      {/* Show external label only for the default icon variant */}
      {launcher.variant === 'icon' && launcher.label?.show && (
        <span style={getLabelStyles()}>{launcher.label.text}</span>
      )}
    </div>
  );
}
