'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import Link from 'next/link';

interface DeploySectionProps {
  draft: VoiceWidgetConfig;
  onChange: (patch: Partial<VoiceWidgetConfig>) => void;
  widgetName: string;
  setWidgetName: (val: string) => void;
  widgetId: string;
  setWidgetId: (val: string) => void;
  // Credentials are kept separate (never in VoiceWidgetConfig) — server-side only
  apiKey: string;
  setApiKey: (val: string) => void;
  isSavedOnServer: boolean;
}

export default function DeploySection({
  draft,
  onChange,
  widgetName,
  setWidgetName,
  widgetId,
  setWidgetId,
  apiKey,
  setApiKey,
  isSavedOnServer,
}: DeploySectionProps) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState(() => {
    if (process.env.NEXT_PUBLIC_BASE_URL) {
      return process.env.NEXT_PUBLIC_BASE_URL;
    }
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'https://your-domain.vercel.app';
  });
  const [showSandbox, setShowSandbox] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_BASE_URL) {
      setOrigin(process.env.NEXT_PUBLIC_BASE_URL);
    } else if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  // Push live config updates into the sandbox iframe via postMessage
  useEffect(() => {
    if (!showSandbox || !iframeRef.current?.contentWindow) return;
    const timer = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'widget-config-update', config: draft },
        '*'
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, showSandbox]);

  const provider = draft.provider?.provider ?? 'retell';
  const agentId = draft.provider?.agentId ?? '';

  const setProvider = (val: 'retell' | 'vapi') => {
    onChange({ provider: { ...draft.provider, provider: val } } as any);
  };

  const setAgentId = (val: string) => {
    onChange({ provider: { ...draft.provider, agentId: val } } as any);
  };

  const cleanSlug = (val: string) => {
    setWidgetId(val.toLowerCase().replace(/[^a-z0-9-_]/g, '-'));
  };

  const embedCode = `<!-- Voice Agent Widget -->
<script
  src="${origin}/widget.js"
  data-widget-id="${widgetId || 'your-widget-id'}"
  defer
></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sandboxUrl = isSavedOnServer ? `/embed/${widgetId}` : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#1E293B' }}>

      {/* ── Widget Fleet link ──────────────────────────────── */}
      <Link
        href="/"
        style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          padding: '8px 10px', borderRadius: '8px',
          background: 'linear-gradient(135deg, #EFF6FF, #F5F3FF)',
          border: '1px solid #BFDBFE',
          color: '#2563EB', fontSize: '11px', fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="14" width="6" height="6" rx="1" />
        </svg>
        View Widget Fleet Dashboard
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto' }}>
          <path d="M7 17L17 7M17 7H7M17 7v10" />
        </svg>
      </Link>

      {/* ── Widget Identity ────────────────────────────────── */}
      <section>
        <h4 style={sectionTitle}>Widget Info</h4>
        <Field label="Widget Name">
          <input
            style={input}
            value={widgetName}
            onChange={(e) => setWidgetName(e.target.value)}
            placeholder="e.g. Lobby Receptionist"
          />
        </Field>
        <Field label="Widget ID (slug)" hint="Lowercase letters, numbers, hyphens only.">
          <input
            style={input}
            value={widgetId}
            onChange={(e) => cleanSlug(e.target.value)}
            placeholder="e.g. lobby-receptionist"
          />
        </Field>
      </section>

      <hr style={divider} />

      {/* ── Provider + Agent ───────────────────────────────── */}
      <section>
        <h4 style={sectionTitle}>Voice Provider & Agent</h4>

        <Field label="AI Provider">
          <select style={select} value={provider} onChange={(e) => setProvider(e.target.value as any)}>
            <option value="retell">Retell AI</option>
            <option value="vapi">Vapi AI</option>
          </select>
        </Field>

        <Field
          label={provider === 'retell' ? 'Retell Agent ID' : 'Vapi Assistant ID'}
          hint={
            provider === 'retell'
              ? 'Find this in the Retell dashboard → Agents. Safe to store in config.'
              : 'Find this in the Vapi dashboard → Assistants. Safe to store in config.'
          }
        >
          <input
            style={input}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value.trim())}
            placeholder={provider === 'retell' ? 'agent_xxxxxxxxxx' : 'asst_xxxxxxxxxx'}
          />
        </Field>

        <Field
          label={provider === 'retell' ? 'Retell API Key (server secret)' : 'Vapi Public Key (client safe)'}
          hint={provider === 'retell'
            ? 'Stored server-side only — never sent to the browser.'
            : 'Find this in the Vapi dashboard → API Keys (Public Key / Key starting with "pbk_"). Safe to send to the browser for WebRTC.'
          }
        >
          <input
            style={input}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKey ? '••••••••' : `Enter ${provider === 'retell' ? 'Retell API Key' : 'Vapi Public Key'}`}
            autoComplete="new-password"
          />
        </Field>
      </section>

      <hr style={divider} />

      {/* ── Sandbox Preview ─────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h4 style={{ ...sectionTitle, margin: 0 }}>Sandbox Preview</h4>
          <button
            onClick={() => setShowSandbox(v => !v)}
            style={{
              height: '24px', padding: '0 10px',
              borderRadius: '6px', border: '1px solid #D1D5DB',
              background: showSandbox ? '#EFF6FF' : '#fff',
              color: showSandbox ? '#2563EB' : '#374151',
              fontSize: '10px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d={showSandbox ? 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' : 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24'} />
              {!showSandbox && <line x1="1" y1="1" x2="23" y2="23" />}
            </svg>
            {showSandbox ? 'Hide' : 'Show'}
          </button>
        </div>

        {showSandbox ? (
          <div style={{ position: 'relative' }}>
            {sandboxUrl ? (
              <>
                <div style={{
                  borderRadius: '10px', overflow: 'hidden',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                }}>
                  {/* Mini browser chrome */}
                  <div style={{
                    height: '28px', background: '#F0F0F0',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '0 10px',
                  }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['#fc5253', '#fdbc40', '#34c84a'].map((c, i) => (
                        <span key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: c }} />
                      ))}
                    </div>
                    <div style={{
                      flex: 1, height: '16px', background: '#E2E8F0',
                      borderRadius: '4px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', maxWidth: '200px', margin: '0 auto',
                    }}>
                      <span style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace' }}>
                        {origin}/embed/{widgetId}
                      </span>
                    </div>
                  </div>
                  <iframe
                    ref={iframeRef}
                    src={sandboxUrl}
                    style={{
                      width: '100%', height: '280px',
                      border: 'none', display: 'block',
                      background: '#F8FAFC',
                    }}
                    title="Widget Sandbox Preview"
                    allow="microphone"
                  />
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#94A3B8', textAlign: 'center' }}>
                  Live sandbox — visual changes sync automatically
                </p>
              </>
            ) : (
              <div style={{
                background: '#FFFBEB', border: '1px solid #FDE68A',
                borderRadius: '8px', padding: '14px', textAlign: 'center',
              }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#92400E', fontWeight: 600 }}>
                  Save first to activate the sandbox preview
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#B45309' }}>
                  Click <strong>Save</strong> above to register this widget, then return here.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #D1D5DB',
            padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '11px',
          }}>
            Click "Show" to open the sandbox preview
          </div>
        )}
      </section>

      <hr style={divider} />

      {/* ── Install Snippet ────────────────────────────────── */}
      <section>
        <h4 style={sectionTitle}>Installation Snippet</h4>

        {!isSavedOnServer ? (
          <div style={alertBox('#FEF3C7', '#D97706')}>
            <strong style={{ fontSize: '11px' }}>Unsaved — save first to activate</strong>
            <p style={{ margin: '2px 0 0', fontSize: '10px' }}>
              Click <b>Save</b> above to register this widget ID and credentials on the server.
            </p>
          </div>
        ) : (
          <div style={alertBox('#DCFCE7', '#15803D')}>
            <strong style={{ fontSize: '11px' }}>✓ Active widget</strong>
            <p style={{ margin: '2px 0 0', fontSize: '10px' }}>
              Copy the snippet below and paste it into any website's <code>&lt;body&gt;</code>.
            </p>
          </div>
        )}

        <div style={snippetBox}>
          <pre style={codeStyle}>{embedCode}</pre>
          <button
            onClick={handleCopy}
            disabled={!widgetId}
            style={{ ...copyBtn, background: copied ? '#10B981' : '#1E293B' }}
          >
            {copied ? 'Copied ✓' : 'Copy Snippet'}
          </button>
        </div>

        {isSavedOnServer && (
          <a href={`/embed/${widgetId}`} target="_blank" rel="noopener noreferrer" style={previewLink}>
            Open Widget Sandbox ↗
          </a>
        )}
      </section>
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────── */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={fieldLabel}>{label}</label>
      {children}
      {hint && <span style={fieldHint}>{hint}</span>}
    </div>
  );
}

function alertBox(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    border: `1px solid ${color}30`,
    borderRadius: '6px',
    padding: '8px 10px',
    marginBottom: '10px',
    color,
  };
}

/* ── Styles ──────────────────────────────────────────────── */

const sectionTitle: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#334155',
};

const divider: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #F1F5F9',
  margin: '4px 0',
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#64748B',
  marginBottom: '4px',
};

const fieldHint: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  color: '#94A3B8',
  marginTop: '3px',
  lineHeight: 1.3,
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: '6px',
  border: '1px solid #D1D5DB',
  fontSize: '12px',
  color: '#1E293B',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  background: '#fff',
};

const select: React.CSSProperties = {
  ...input,
  cursor: 'pointer',
};

const snippetBox: React.CSSProperties = {
  background: '#0F172A',
  borderRadius: '8px',
  padding: '10px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginBottom: '8px',
};

const codeStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '10px',
  fontFamily: 'Consolas, Monaco, monospace',
  color: '#38BDF8',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  lineHeight: 1.5,
};

const copyBtn: React.CSSProperties = {
  border: 'none',
  padding: '6px 12px',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s',
};

const previewLink: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  marginTop: '4px',
  padding: '7px 10px',
  borderRadius: '6px',
  background: '#EFF6FF',
  border: '1px solid #BFDBFE',
  color: '#1D4ED8',
  fontSize: '11px',
  fontWeight: 600,
  textDecoration: 'none',
};
