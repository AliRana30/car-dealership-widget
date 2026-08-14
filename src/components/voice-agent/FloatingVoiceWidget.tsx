import React, { useState } from 'react';
import VoiceAgentWidget from './VoiceAgentWidget';
import { getVoiceWidgetConfig } from '@/config/voiceWidget/default';
import { CallState } from '@/config/voiceWidget/types';

export type { CallState };

export default function FloatingVoiceWidget() {
  const [clientId, setClientId] = useState<string>('myfrontdesk');

  // Load the validated configuration from the registry
  const config = getVoiceWidgetConfig(clientId);

  return (
    <>
      {/* Dynamic Voice Widget */}
      <VoiceAgentWidget config={config} />

      {/* Floating Branded Preset Switcher */}
      <div
        className="voice-widget-branding-switcher"
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          zIndex: 999, // Render just under the widget
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(14, 27, 42, 0.08)',
          boxShadow: '0 8px 32px rgba(14, 27, 42, 0.08)',
          fontFamily: "'Figtree', sans-serif",
          maxWidth: '300px',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor:
                clientId === 'myfrontdesk'
                  ? '#2F8FE0'
                  : clientId === 'clinic-a'
                  ? '#059669'
                  : '#6366F1',
              transition: 'background-color 0.3s ease',
            }}
          />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'rgba(14, 27, 42, 0.8)',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            Widget Branding Demo
          </span>
        </div>
        <p style={{ fontSize: '11px', color: 'rgba(14, 27, 42, 0.6)', margin: '0 0 4px', lineHeight: 1.4 }}>
          Toggle presets to preview different colors, fonts, icons, positions, and copy instantly.
        </p>
        <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
          <button
            onClick={() => setClientId('myfrontdesk')}
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '8px',
              border: '1px solid',
              borderColor: clientId === 'myfrontdesk' ? '#2F8FE0' : 'rgba(14, 27, 42, 0.08)',
              background: clientId === 'myfrontdesk' ? '#2F8FE0' : '#ffffff',
              color: clientId === 'myfrontdesk' ? '#ffffff' : 'rgba(14, 27, 42, 0.8)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: clientId === 'myfrontdesk' ? '0 2px 8px rgba(47, 143, 224, 0.3)' : 'none',
              outline: 'none',
            }}
          >
            Default
          </button>
          <button
            onClick={() => setClientId('clinic-a')}
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '8px',
              border: '1px solid',
              borderColor: clientId === 'clinic-a' ? '#059669' : 'rgba(14, 27, 42, 0.08)',
              background: clientId === 'clinic-a' ? '#059669' : '#ffffff',
              color: clientId === 'clinic-a' ? '#ffffff' : 'rgba(14, 27, 42, 0.8)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: clientId === 'clinic-a' ? '0 2px 8px rgba(5, 150, 105, 0.3)' : 'none',
              outline: 'none',
            }}
          >
            Clinic
          </button>
          <button
            onClick={() => setClientId('dark-saas')}
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '8px',
              border: '1px solid',
              borderColor: clientId === 'dark-saas' ? '#6366F1' : 'rgba(14, 27, 42, 0.08)',
              background: clientId === 'dark-saas' ? '#6366F1' : '#ffffff',
              color: clientId === 'dark-saas' ? '#ffffff' : 'rgba(14, 27, 42, 0.8)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: clientId === 'dark-saas' ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none',
              outline: 'none',
            }}
          >
            SaaS
          </button>
        </div>

        {/* CSS Override to reposition on mobile screens */}
        <style dangerouslySetInnerHTML={{__html: `
          @media (max-width: 860px) {
            .voice-widget-branding-switcher {
              bottom: auto !important;
              top: 76px !important;
              left: 50% !important;
              transform: translateX(-50%) !important;
              width: calc(100% - 32px) !important;
              max-width: none !important;
              box-shadow: 0 4px 20px rgba(0,0,0,0.06) !important;
            }
          }
        `}} />
      </div>
    </>
  );
}
