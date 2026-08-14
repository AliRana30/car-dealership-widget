'use client';
import React from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import dynamic from 'next/dynamic';

const VoiceAgentWidget = dynamic(
  () => import('@/components/voice-agent/VoiceAgentWidget'),
  { ssr: false, loading: () => <div style={loadingStyle}>Loading widget…</div> }
);

interface Props {
  draft: VoiceWidgetConfig;
  widgetId?: string;
}

export default function PreviewArea({ draft, widgetId }: Props) {
  // Force inline mode for preview so it stays inside the customizer
  const previewConfig: VoiceWidgetConfig = {
    ...draft,
    mode: 'floating',
  };

  return (
    <div style={styles.previewOuter}>
      <div style={styles.previewLabel}>
        <span style={styles.dot} />
        Live Preview
      </div>

      {/* Simulated browser chrome */}
      <div style={styles.browserChrome}>
        <div style={styles.browserBar}>
          <div style={styles.trafficLights}>
            <span style={{ ...styles.trafficDot, background: '#fc5253' }} />
            <span style={{ ...styles.trafficDot, background: '#fdbc40' }} />
            <span style={{ ...styles.trafficDot, background: '#34c84a' }} />
          </div>
          <div style={styles.urlBar}>
            <span style={styles.urlText}>yoursite.com</span>
          </div>
        </div>

        {/* Simulated page content */}
        <div style={styles.fakePageContent}>
          <div style={styles.fakeNav}>
            <div style={styles.fakeNavLogo} />
            <div style={styles.fakeNavLinks}>
              <div style={styles.fakeLink} />
              <div style={styles.fakeLink} />
              <div style={styles.fakeLink} />
            </div>
          </div>
          <div style={styles.fakeHero}>
            <div style={styles.fakeHeading} />
            <div style={{ ...styles.fakeText, width: '80%' }} />
            <div style={{ ...styles.fakeText, width: '60%' }} />
          </div>

          {/* The real widget rendered inside the preview */}
          <div style={styles.widgetWrapper}>
            <VoiceAgentWidget config={previewConfig} widgetId={widgetId} />
          </div>
        </div>
      </div>

      <div style={styles.previewNote}>
        Widget is fully interactive. Click the launcher to open it.
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  previewOuter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '24px',
    background: '#f4f5f7',
    gap: '12px',
    overflow: 'hidden',
  },
  previewLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#22c55e',
    display: 'inline-block',
    boxShadow: '0 0 0 2px rgba(34,197,94,0.3)',
  },
  browserChrome: {
    width: '100%',
    maxWidth: '640px',
    flex: 1,
    borderRadius: '12px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  browserBar: {
    height: '40px',
    background: '#f0f0f0',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 12px',
    flexShrink: 0,
  },
  trafficLights: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  trafficDot: {
    width: '11px',
    height: '11px',
    borderRadius: '50%',
  },
  urlBar: {
    flex: 1,
    background: '#e5e7eb',
    borderRadius: '6px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '320px',
    margin: '0 auto',
  },
  urlText: {
    fontSize: '11px',
    color: '#6b7280',
    fontFamily: "'JetBrains Mono', monospace",
  },
  fakePageContent: {
    flex: 1,
    overflow: 'hidden',
    padding: '24px 24px 0',
    position: 'relative',
    background: '#ffffff',
  },
  fakeNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '32px',
  },
  fakeNavLogo: {
    width: '80px',
    height: '16px',
    background: '#e5e7eb',
    borderRadius: '4px',
  },
  fakeNavLinks: {
    display: 'flex',
    gap: '16px',
  },
  fakeLink: {
    width: '48px',
    height: '10px',
    background: '#e5e7eb',
    borderRadius: '3px',
  },
  fakeHero: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '24px',
  },
  fakeHeading: {
    width: '70%',
    height: '28px',
    background: '#e5e7eb',
    borderRadius: '5px',
  },
  fakeText: {
    height: '12px',
    background: '#f0f0f0',
    borderRadius: '3px',
  },
  widgetWrapper: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'auto',
    transform: 'translate3d(0, 0, 0)',
  },
  previewNote: {
    fontSize: '11px',
    color: '#9ca3af',
  },
};

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '60px',
  fontSize: '12px',
  color: '#9ca3af',
};
