'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import dynamic from 'next/dynamic';
import { Smartphone, Tablet, Monitor, Maximize2 } from 'lucide-react';

const VoiceAgentWidget = dynamic(
  () => import('@/components/voice-agent/VoiceAgentWidget'),
  { ssr: false, loading: () => <div style={loadingStyle}>Loading widget…</div> }
);

interface Props {
  draft: VoiceWidgetConfig;
  widgetId?: string;
}

type DevicePreset = 'mobile' | 'mobile-lg' | 'tablet' | 'desktop' | 'fluid';

const PRESET_WIDTHS: Record<DevicePreset, number | string> = {
  'mobile': 375,
  'mobile-lg': 430,
  'tablet': 768,
  'desktop': 1024,
  'fluid': '100%',
};

export default function PreviewArea({ draft, widgetId }: Props) {
  const [activePreset, setActivePreset] = useState<DevicePreset>('fluid');
  const [customWidth, setCustomWidth] = useState<number>(680);
  const [isDragging, setIsDragging] = useState<'left' | 'right' | null>(null);
  const [simulatedUrl, setSimulatedUrl] = useState<string>('yoursite.com');
  const [navNotification, setNavNotification] = useState<{ url: string; title?: string } | null>(null);
  const startPosRef = useRef({ x: 0, width: 680 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Listen to agent browser navigation events from widget
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'voice-agent-navigate' || e.data?.type === 'WIDGET_NAVIGATE') {
        const rawUrl = e.data.url;
        if (rawUrl) {
          try {
            const parsed = new URL(rawUrl);
            setSimulatedUrl(`${parsed.host}${parsed.pathname}`);
          } catch {
            setSimulatedUrl(rawUrl);
          }
          setNavNotification({ url: rawUrl, title: e.data.payload?.title });
          setTimeout(() => setNavNotification(null), 7000);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Force floating mode for preview inside the customizer frame
  const previewConfig: VoiceWidgetConfig = {
    ...draft,
    mode: 'floating',
  };

  const handlePresetSelect = (preset: DevicePreset) => {
    setActivePreset(preset);
    if (typeof PRESET_WIDTHS[preset] === 'number') {
      setCustomWidth(PRESET_WIDTHS[preset] as number);
    }
  };

  // Start dragging width from left or right edge
  const handleDragStart = (edge: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(edge);
    setActivePreset('fluid'); // Switch to custom width mode on manual drag
    startPosRef.current = {
      x: e.clientX,
      width: customWidth,
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startPosRef.current.x;
    // Right drag expands positively; Left drag expands negatively
    const multiplier = isDragging === 'right' ? 2 : -2;
    const newWidth = Math.min(Math.max(startPosRef.current.width + deltaX * multiplier, 320), 1200);
    setCustomWidth(Math.round(newWidth));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(null);
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const currentComputedWidth = activePreset === 'fluid' && customWidth >= 1000 ? '100%' : `${customWidth}px`;

  return (
    <div style={styles.previewOuter} className="customizer-preview-outer">
      {/* Top bar with preset selector and resolution indicator */}
      <div style={styles.previewHeader} className="customizer-preview-header">
        <div style={styles.previewLabel}>
          <span style={styles.dot} />
          Live Preview
        </div>

        <div style={styles.presetGroup}>
          <button
            onClick={() => handlePresetSelect('mobile')}
            style={{
              ...styles.presetBtn,
              ...(activePreset === 'mobile' ? styles.presetBtnActive : {}),
            }}
            title="Mobile (375px)"
          >
            <Smartphone size={13} />
            <span>375px</span>
          </button>
          <button
            onClick={() => handlePresetSelect('mobile-lg')}
            style={{
              ...styles.presetBtn,
              ...(activePreset === 'mobile-lg' ? styles.presetBtnActive : {}),
            }}
            title="Mobile Large (430px)"
          >
            <Smartphone size={13} />
            <span>430px</span>
          </button>
          <button
            onClick={() => handlePresetSelect('tablet')}
            style={{
              ...styles.presetBtn,
              ...(activePreset === 'tablet' ? styles.presetBtnActive : {}),
            }}
            title="Tablet (768px)"
          >
            <Tablet size={13} />
            <span>768px</span>
          </button>
          <button
            onClick={() => handlePresetSelect('desktop')}
            style={{
              ...styles.presetBtn,
              ...(activePreset === 'desktop' ? styles.presetBtnActive : {}),
            }}
            title="Desktop (1024px)"
          >
            <Monitor size={13} />
            <span>1024px</span>
          </button>
          <button
            onClick={() => handlePresetSelect('fluid')}
            style={{
              ...styles.presetBtn,
              ...(activePreset === 'fluid' ? styles.presetBtnActive : {}),
            }}
            title="Fluid Drag"
          >
            <Maximize2 size={12} />
            <span>Fluid</span>
          </button>
        </div>

        <div style={styles.resolutionBadge}>
          {typeof currentComputedWidth === 'string' && currentComputedWidth.includes('px')
            ? currentComputedWidth
            : `${customWidth}px`}
        </div>
      </div>

      <div style={styles.previewBody} className="customizer-preview-body" ref={containerRef}>
        {/* Simulated browser chrome wrapper with drag handles */}
        <div
          style={{
            ...styles.browserChrome,
            width: currentComputedWidth,
            maxWidth: '100%',
            transition: isDragging ? 'none' : 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            position: 'relative',
          }}
          className="customizer-browser-chrome"
        >
          {/* Left Width Drag Handle */}
          <div
            onMouseDown={(e) => handleDragStart('left', e)}
            style={{
              ...styles.dragHandle,
              left: '-8px',
              cursor: 'ew-resize',
              background: isDragging === 'left' ? '#2563EB' : 'transparent',
            }}
            title="Drag to resize canvas width"
          >
            <div style={styles.handleGrip} />
          </div>

          {/* Browser Bar */}
          <div style={styles.browserBar}>
            <div style={styles.trafficLights}>
              <span style={{ ...styles.trafficDot, background: '#fc5253' }} />
              <span style={{ ...styles.trafficDot, background: '#fdbc40' }} />
              <span style={{ ...styles.trafficDot, background: '#34c84a' }} />
            </div>
            <div style={styles.urlBar}>
              <span style={styles.urlText}>{simulatedUrl}</span>
            </div>
          </div>

          {/* Realtime Agent Navigation Banner */}
          {navNotification && (
            <div style={{
              background: '#EFF6FF',
              borderBottom: '1px solid #BFDBFE',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#1E40AF',
              gap: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                <span style={{ fontSize: '13px' }}>🧭</span>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Agent Navigated:</span>
                <span style={{ color: '#2563EB', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {navNotification.title ? `${navNotification.title} — ` : ''}{navNotification.url}
                </span>
              </div>
              <a
                href={navNotification.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#2563EB',
                  textDecoration: 'underline',
                  flexShrink: 0,
                }}
              >
                Open Page ↗
              </a>
            </div>
          )}

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

            {/* Real widget rendered inside preview */}
            <div style={styles.widgetWrapper}>
              <VoiceAgentWidget config={previewConfig} widgetId={widgetId} isDemo={false} />
            </div>
          </div>

          {/* Right Width Drag Handle */}
          <div
            onMouseDown={(e) => handleDragStart('right', e)}
            style={{
              ...styles.dragHandle,
              right: '-8px',
              cursor: 'ew-resize',
              background: isDragging === 'right' ? '#2563EB' : 'transparent',
            }}
            title="Drag to resize canvas width"
          >
            <div style={styles.handleGrip} />
          </div>
        </div>

        <div style={styles.previewNote}>
          Drag the blue edges or select preset resolutions above to test responsive layouts.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  previewOuter: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#f8fafc',
    overflow: 'hidden',
    userSelect: 'none',
  },
  previewHeader: {
    height: '46px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fafafa',
    width: '100%',
    boxSizing: 'border-box',
    flexShrink: 0,
    gap: '12px',
  },
  previewBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 20px',
    overflowY: 'auto',
    gap: '14px',
    position: 'relative',
  },
  previewLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink: 0,
  },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#22c55e',
    display: 'inline-block',
    boxShadow: '0 0 0 2px rgba(34,197,94,0.3)',
  },
  presetGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: '#f1f5f9',
    padding: '3px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  presetBtn: {
    border: 'none',
    background: 'transparent',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
  },
  presetBtnActive: {
    background: '#ffffff',
    color: '#2563eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  resolutionBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748B',
    background: '#F1F5F9',
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid #E2E8F0',
    fontFamily: "'JetBrains Mono', monospace",
  },
  browserChrome: {
    flex: 1,
    borderRadius: '12px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    overflow: 'hidden',
    boxShadow: '0 10px 36px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '460px',
    maxHeight: '85vh',
  },
  dragHandle: {
    position: 'absolute',
    top: '30%',
    bottom: '30%',
    width: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    borderRadius: '4px',
    transition: 'background 0.15s ease',
  },
  handleGrip: {
    width: '4px',
    height: '36px',
    borderRadius: '999px',
    background: '#94A3B8',
    opacity: 0.8,
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
