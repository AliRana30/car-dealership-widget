'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import VoiceAgentWidget from '@/components/voice-agent/VoiceAgentWidget';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import { fromConfigurationRecord, defaultVoiceWidgetConfig } from '@/config/voiceWidget/default';

export default function EmbedWidgetPage() {
  const params = useParams();
  const id = params.id as string;

  const [widgetData, setWidgetData] = useState<{ config: VoiceWidgetConfig; provider: string }>({
    config: defaultVoiceWidgetConfig,
    provider: 'retell',
  });
  const [initialOpen, setInitialOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const shouldOpen =
        sp.get('open') === '1' ||
        Boolean(sp.get('widget_resume')) ||
        sessionStorage.getItem(`myfrontdesk_open_${id}`) === '1' ||
        sessionStorage.getItem(`myfrontdesk_reopen_${id}`) === 'true';

      if (shouldOpen) {
        setInitialOpen(true);
      }
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    async function fetchWidget() {
      try {
        const res = await fetch(`/api/widgets/${encodeURIComponent(id)}/configuration`);
        if (res.ok) {
          const configRecord = await res.json();
          const voiceConfig = fromConfigurationRecord(configRecord);
          setWidgetData({ config: voiceConfig, provider: voiceConfig.provider?.provider || 'retell' });
        }
      } catch (err: any) {
        console.warn('[EmbedWidget] Using default configuration:', err);
      }
    }

    fetchWidget();
  }, [id]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data && e.data.type === 'widget-config-update') {
        setWidgetData((prev) => ({
          ...prev,
          config: e.data.config,
        }));
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
      `}</style>
      
      {/* 
        Mount the VoiceAgentWidget.
        By passing widgetId={id}, the widget's internal connection logic will route call creations
        securely through the backend API using its respective private credentials.
      */}
      <VoiceAgentWidget 
        widgetId={id} 
        config={widgetData.config}
        initialOpen={initialOpen}
      />
    </>
  );
}
