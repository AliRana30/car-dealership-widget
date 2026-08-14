'use client';
import React from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import { COLOR_TOKEN_GROUPS } from './colorTokens';
import { getContrastColor } from './colorUtils';

interface Props {
  draft: VoiceWidgetConfig;
  openTokenId: string | null;
  onOpenToken: (id: string) => void;
}

export default function ColorsSection({ draft, openTokenId, onOpenToken }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {COLOR_TOKEN_GROUPS.map((grp) => (
        <div key={grp.group}>
          <div style={groupHeaderStyle}>{grp.group}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {grp.tokens.map((token) => {
              const rawColor = (draft.theme as any)[token.field] as string;
              const isOpen = openTokenId === token.id;
              // Normalize for display — might be rgba or hex
              const displayColor = rawColor || '#ffffff';
              const isHex = displayColor.startsWith('#');

              return (
                <button
                  key={token.id}
                  onClick={() => onOpenToken(token.id)}
                  style={{
                    ...tokenRowStyle,
                    background: isOpen ? '#eff6ff' : 'transparent',
                    borderColor: isOpen ? '#bfdbfe' : 'transparent',
                  }}
                >
                  <div style={swatchWrapStyle}>
                    <div
                      style={{
                        ...swatchStyle,
                        background: displayColor,
                        boxShadow: isOpen
                          ? '0 0 0 2px #2563eb'
                          : '0 0 0 1px rgba(0,0,0,0.12)',
                      }}
                    />
                    {isOpen && (
                      <div style={activeSwatchDotStyle} />
                    )}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={tokenLabelStyle}>{token.label}</div>
                    {token.description && (
                      <div style={tokenDescStyle}>{token.description}</div>
                    )}
                  </div>
                  <div style={tokenValueStyle}>
                    {isHex ? displayColor.toUpperCase() : displayColor}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const groupHeaderStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: '#9ca3af',
  padding: '0 2px 8px',
  borderBottom: '1px solid #f0f0f0',
  marginBottom: '4px',
};

const tokenRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid transparent',
  background: 'transparent',
  cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s',
  width: '100%',
};

const swatchWrapStyle: React.CSSProperties = {
  position: 'relative',
  flexShrink: 0,
};

const swatchStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '7px',
  flexShrink: 0,
};

const activeSwatchDotStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '-3px',
  right: '-3px',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: '#2563eb',
  border: '1.5px solid white',
};

const tokenLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#111827',
};

const tokenDescStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#9ca3af',
  marginTop: '1px',
};

const tokenValueStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  color: '#6b7280',
  letterSpacing: '0.02em',
  flexShrink: 0,
};
