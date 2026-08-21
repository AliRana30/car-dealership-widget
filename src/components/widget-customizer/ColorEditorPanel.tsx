'use client';
import React from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import { ALL_COLOR_TOKENS } from './colorTokens';
import ColorPicker from './ColorPicker';

interface Props {
  draft: VoiceWidgetConfig;
  openTokenId: string | null;
  onClose: () => void;
  onColorChange: (field: string, hex: string) => void;
}

export default function ColorEditorPanel({ draft, openTokenId, onClose, onColorChange }: Props) {
  const token = ALL_COLOR_TOKENS.find(t => t.id === openTokenId);
  const currentColor = token ? ((draft.theme as any)[token.field] as string) : '#ffffff';

  if (!token) {
    return (
      <aside style={styles.panel} className="customizer-color-panel panel-empty">
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>◐</div>
          <div style={styles.emptyTitle}>Color Editor</div>
          <div style={styles.emptyDesc}>
            Select a color token from the Colors section to edit it here.
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside style={styles.panel} className="customizer-color-panel panel-active">
      <div style={styles.header}>
        <div>
          <div style={styles.headerToken}>{token.group} / {token.label}</div>
          {token.description && <div style={styles.headerDesc}>{token.description}</div>}
        </div>
        <button onClick={onClose} style={styles.closeBtn} aria-label="Close color editor">✕</button>
      </div>

      <div style={styles.body}>
        <ColorPicker
          key={token.id}
          value={currentColor.startsWith('#') ? currentColor : '#6366F1'}
          onChange={(hex) => onColorChange(token.field, hex)}
        />
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: '280px',
    minWidth: '280px',
    borderLeft: '1px solid #e5e7eb',
    background: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '32px 24px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '36px',
    marginBottom: '16px',
    color: '#d1d5db',
    lineHeight: 1,
  },
  emptyTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '8px',
  },
  emptyDesc: {
    fontSize: '12px',
    color: '#9ca3af',
    lineHeight: 1.6,
  },
  header: {
    padding: '24px 16px 16px',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
    background: '#fafafa',
  },
  headerToken: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '2px',
  },
  headerDesc: {
    fontSize: '11px',
    color: '#9ca3af',
  },
  closeBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '5px',
    border: '1px solid #e5e7eb',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '11px',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
  },
  body: {
    padding: '20px 16px',
    flex: 1,
  },
};
