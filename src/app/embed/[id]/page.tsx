'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import VoiceAgentWidget from '@/components/voice-agent/VoiceAgentWidget';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import { fromConfigurationRecord } from '@/config/voiceWidget/default';

export default function EmbedWidgetPage() {
  const params = useParams();
  const id = params.id as string;

  const [widgetData, setWidgetData] = useState<{ config: VoiceWidgetConfig; provider: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchWidget() {
      try {
        const res = await fetch(`/api/widgets/${encodeURIComponent(id)}/configuration`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Widget configuration not found.');
          }
          throw new Error('Failed to load widget configuration.');
        }
        const configRecord = await res.json();
        const voiceConfig = fromConfigurationRecord(configRecord);
        setWidgetData({ config: voiceConfig, provider: voiceConfig.provider?.provider || 'retell' });
      } catch (err: any) {
        console.error('[EmbedWidget] Fetch failed:', err);
        setError(err.message || 'Error loading widget.');
      } finally {
        setLoading(false);
      }
    }

    fetchWidget();
  }, [id]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data && e.data.type === 'widget-config-update') {
        setWidgetData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            config: e.data.config,
          };
        });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (loading) {
    return (
      <div style={placeholderStyle}>
        <div className="animate-spin-slow" style={spinnerStyle} />
      </div>
    );
  }

  if (error || !widgetData) {
    return (
      <div style={placeholderStyle}>
        <div style={errorCardStyle}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" style={{ marginBottom: '8px' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>Widget Error</span>
          <span style={{ fontSize: '11px', color: '#64748B', textAlign: 'center', marginTop: '2px' }}>
            {error || 'Widget not found'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        html, body {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          width: 100vw !important;
          height: 100vh !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }
        /* Spinner animation */
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin 1.2s linear infinite;
        }
      `}</style>
      
      {/* 
        Mount the VoiceAgentWidget.
        By passing widgetId={id}, the widget's internal connection logic will route call creations
        securely through the backend API using its respective private credentials.
      */}
      <VoiceAgentWidget 
        widgetId={id} 
        config={widgetData.config}
      />
    </>
  );
}

const placeholderStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
};

const spinnerStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: '3px solid rgba(14, 27, 42, 0.08)',
  borderTopColor: '#2F8FE0',
};

const errorCardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  padding: '12px 16px',
  borderRadius: '12px',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
  border: '1px solid rgba(0, 0, 0, 0.05)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  maxWidth: '220px',
};
