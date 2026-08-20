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
  apiKey: string;
  setApiKey: (val: string) => void;
  isSavedOnServer: boolean;
  allowedDomains?: string[];
  websiteName?: string;
  widgetStatus?: 'active' | 'inactive' | 'paused';
}

// ── Universal embed code helpers ─────────────────────────────────────────────
function getUniversalSnippet(origin: string, widgetId: string) {
  return `<!-- Voice Agent Widget -->
<script
  src="${origin}/widget.js"
  data-widget-id="${widgetId || 'your-widget-id'}"
  defer
></script>`;
}

function getIframeSnippet(origin: string, widgetId: string) {
  return `<iframe
  src="${origin}/embed/${widgetId || 'your-widget-id'}"
  width="100%"
  height="620px"
  style="border:none;border-radius:12px;"
  allow="microphone"
></iframe>`;
}

function getAIAgentPrompt(origin: string, widgetId: string, widgetName?: string) {
  return `### Task: Integrate Autonomous AI Voice & Text Front Desk Widget

Please integrate the Front Desk AI Voice & Text Widget into this web application.

**Widget Configuration Details:**
- **Widget ID**: \`${widgetId || 'your-widget-id'}\`
- **Widget Script URL**: \`${origin}/widget.js\`
- **Widget Name**: \`${widgetName || 'Front Desk Widget'}\`

---

### Implementation Instructions:

1. **Next.js (App Router - \`app/layout.tsx\`):**
   Import \`Script\` from \`next/script\` and place this in your root layout:
   \`\`\`tsx
   import Script from 'next/script';

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en">
         <body>
           {children}
           <Script
             src="${origin}/widget.js"
             data-widget-id="${widgetId || 'your-widget-id'}"
             strategy="afterInteractive"
           />
         </body>
       </html>
     );
   }
   \`\`\`

2. **React / Vite / Vue / Nuxt / Static HTML (\`index.html\`):**
   Add the script tag right before the closing \`</body>\` tag:
   \`\`\`html
   <script
     src="${origin}/widget.js"
     data-widget-id="${widgetId || 'your-widget-id'}"
     defer
   ></script>
   \`\`\`

3. **Shopify (Liquid - \`layout/theme.liquid\`):**
   Paste immediately before \`</body>\`:
   \`\`\`liquid
   <script src="${origin}/widget.js" data-widget-id="${widgetId || 'your-widget-id'}" defer></script>
   \`\`\`

4. **WordPress (\`functions.php\` or Header/Footer Plugin):**
   \`\`\`php
   add_action('wp_footer', function() {
       echo '<script src="${origin}/widget.js" data-widget-id="${widgetId || 'your-widget-id'}" defer></script>';
   });
   \`\`\`

5. **Permissions & CSP:**
   Ensure Content-Security-Policy (CSP) allows scripts from \`${origin}\` and microphone access for voice calls.

6. **Verification:**
   Verify that the floating AI launcher button appears in the bottom right corner of the website and clicking it opens the chat and voice call interface.`;
}

const WHERE_TO_PASTE = [
  { platform: 'WordPress', icon: '⬜', tip: 'Install the free "Insert Headers and Footers" plugin → Settings → paste in Footer section.' },
  { platform: 'Shopify', icon: '🛍️', tip: 'Online Store → Themes → Edit Code → layout/theme.liquid → paste before </body>.' },
  { platform: 'Webflow', icon: '🌐', tip: 'Project Settings → Custom Code → Footer Code → paste and publish.' },
  { platform: 'Squarespace', icon: '⬛', tip: 'Settings → Advanced → Code Injection → Footer → paste.' },
  { platform: 'Wix', icon: '🔷', tip: 'Settings → Custom Code → Add Custom Code → Body (end) → paste.' },
  { platform: 'PHP / Laravel', icon: '🐘', tip: 'Open your layout file (e.g. layout.blade.php or footer.php) → paste before </body>.' },
  { platform: 'HTML / Static', icon: '📄', tip: 'Open any .html file → paste before </body>.' },
  { platform: 'React / Next.js / Vue', icon: '⚛️', tip: 'Add to root layout file (index.html or layout.tsx) before </body>. Works without a component wrapper.' },
];

function highlightHtml(code: string) {
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/(&lt;\/?[a-zA-Z0-9-]+)(&gt;|\s)/g, '<span style="color:#F43F5E">$1</span>$2');
  html = html.replace(/(&lt;\/?[a-zA-Z0-9-]+$)/g, '<span style="color:#F43F5E">$1</span>');
  html = html.replace(/(\s[a-zA-Z0-9-]+)=/g, '<span style="color:#F59E0B">$1</span>=');
  html = html.replace(/(["'].*?["'])/g, '<span style="color:#10B981">$1</span>');
  html = html.replace(/(&lt;!--.*?--&gt;)/g, '<span style="color:#64748B;font-style:italic">$1</span>');
  return <code dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── UniversalEmbedSection ────────────────────────────────────────────────────
interface UniversalEmbedSectionProps {
  origin: string;
  widgetId: string;
  widgetName?: string;
  copied: boolean;
  setCopied: (v: boolean) => void;
}

function UniversalEmbedSection({ origin, widgetId, widgetName, copied, setCopied }: UniversalEmbedSectionProps) {
  const [tab, setTab] = React.useState<'script' | 'ai' | 'iframe'>('script');
  const [openTip, setOpenTip] = React.useState<string | null>(null);

  const code = tab === 'script'
    ? getUniversalSnippet(origin, widgetId)
    : tab === 'ai'
    ? getAIAgentPrompt(origin, widgetId, widgetName)
    : getIframeSnippet(origin, widgetId);

  const handleCopy = () => {
    if (!widgetId) return;
    navigator.clipboard.writeText(code).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '7px 10px', fontSize: '11px', fontWeight: 600,
    borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: active ? '#2563EB' : 'transparent',
    color: active ? '#fff' : '#64748B',
    transition: 'all 0.15s ease',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Intro */}
      <p style={{ fontSize: '11.5px', color: '#475569', margin: 0, lineHeight: '1.5' }}>
        One universal snippet or AI prompt — integrate into <strong>any</strong> modern codebase in seconds.
      </p>

      {/* Tab switch: Script / AI Agent / iframe */}
      <div style={{
        display: 'flex', gap: '4px', background: '#F1F5F9',
        borderRadius: '8px', padding: '3px',
      }}>
        <button style={tabStyle(tab === 'script')} onClick={() => setTab('script')}>
          📜 Script Tag
        </button>
        <button style={tabStyle(tab === 'ai')} onClick={() => setTab('ai')}>
          🤖 AI Prompt
          <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '4px' }}>Cursor / Claude</span>
        </button>
        <button style={tabStyle(tab === 'iframe')} onClick={() => setTab('iframe')}>
          🖼️ Iframe
        </button>
      </div>

      {/* Code block */}
      <div style={{ background: '#0F172A', borderRadius: '10px', overflow: 'hidden', border: '1px solid #334155' }}>
        {/* Mac chrome header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: '#1E293B', borderBottom: '1px solid #334155',
        }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            {['#EF4444', '#F59E0B', '#10B981'].map((c, i) => (
              <span key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: c }} />
            ))}
          </div>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94A3B8', fontWeight: 500 }}>
            {tab === 'script' ? 'widget.js — Universal Script' : tab === 'ai' ? 'AI Coding Assistant Prompt' : 'Inline iframe Embed'}
          </span>
        </div>
        <div style={{ padding: '14px', maxHeight: tab === 'ai' ? '280px' : 'none', overflowY: 'auto' }}>
          <pre style={{
            margin: 0, overflowX: 'auto', fontSize: '11px',
            fontFamily: 'monospace', lineHeight: '1.6', color: '#E2E8F0',
            whiteSpace: 'pre-wrap',
          }}>
            {tab === 'script' ? highlightHtml(code) : code}
          </pre>
        </div>
      </div>

      {/* Copy button */}
      <button
        onClick={handleCopy}
        disabled={!widgetId}
        style={{
          padding: '9px 16px', borderRadius: '8px', border: 'none',
          background: copied ? '#10B981' : '#2563EB',
          color: '#fff', fontSize: '12px', fontWeight: 700,
          cursor: widgetId ? 'pointer' : 'not-allowed',
          opacity: widgetId ? 1 : 0.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          transition: 'background 0.2s',
        }}
      >
        {copied ? (
          <><span>✓</span> Copied!</>
        ) : (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg> Copy Snippet</>
        )}
      </button>

      {/* Note for iframe */}
      {tab === 'iframe' && (
        <div style={{ fontSize: '10px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '7px', padding: '8px 10px' }}>
          ⚠️ <strong>allow=&quot;microphone&quot;</strong> is required for voice calls inside iframes. Use the Script Tag approach for the floating launcher button experience.
        </div>
      )}

      {/* Where to paste — platform tips */}
      <div style={{ marginTop: '2px' }}>
        <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', margin: '0 0 6px' }}>
          Where to paste it:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {WHERE_TO_PASTE.map(({ platform, icon, tip }) => (
            <div
              key={platform}
              style={{
                border: '1px solid #E2E8F0', borderRadius: '7px',
                background: openTip === platform ? '#F8FAFC' : '#fff',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setOpenTip(openTip === platform ? null : platform)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 600, color: '#334155',
                }}
              >
                <span>{icon} {platform}</span>
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>{openTip === platform ? '▲' : '▼'}</span>
              </button>
              {openTip === platform && (
                <div style={{ padding: '0 10px 8px', fontSize: '11px', color: '#475569', lineHeight: '1.5' }}>
                  {tip}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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
  allowedDomains = [],
  websiteName = 'Default Website',
  widgetStatus = 'active',
}: DeploySectionProps) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState(() => {
    if (process.env.BASE_URL) {
      return process.env.BASE_URL;
    }
    if (process.env.NEXT_PUBLIC_BASE_URL) {
      return process.env.NEXT_PUBLIC_BASE_URL;
    }
    return 'https://your-domain.vercel.app';
  });
  const [showSandbox, setShowSandbox] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);



  useEffect(() => {
    if (process.env.BASE_URL) {
      setOrigin(process.env.BASE_URL);
    } else if (process.env.NEXT_PUBLIC_BASE_URL) {
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



  const sandboxUrl = isSavedOnServer ? `/embed/${widgetId}` : null;

  // Status Badge Rendering
  let badgeColor = '#FFFBEB';
  let badgeTextColor = '#D97706';
  let badgeText = 'Draft / Unsaved';

  if (isSavedOnServer) {
    if (widgetStatus === 'active') {
      badgeColor = '#DCFCE7';
      badgeTextColor = '#15803D';
      badgeText = 'Active & Live';
    } else if (widgetStatus === 'inactive') {
      badgeColor = '#FEE2E2';
      badgeTextColor = '#B91C1C';
      badgeText = 'Inactive';
    } else if (widgetStatus === 'paused') {
      badgeColor = '#FEF3C7';
      badgeTextColor = '#D97706';
      badgeText = 'Paused';
    }
  }

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

      {/* ── Deployment Status Card ─────────────────────────── */}
      <section style={{
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '12px 14px',
      }}>
        <h4 style={{ ...sectionTitle, marginBottom: '12px' }}>Deployment Status</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B', fontWeight: 500 }}>Connection Status</span>
            <span style={{
              background: badgeColor,
              color: badgeTextColor,
              padding: '3px 8px',
              borderRadius: '12px',
              fontSize: '10px',
              fontWeight: 700,
            }}>
              {badgeText}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B', fontWeight: 500 }}>Connected Website</span>
            <span style={{ color: '#1E293B', fontWeight: 600 }}>{websiteName || 'Unassigned'}</span>
          </div>

          {allowedDomains && allowedDomains.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ color: '#64748B', fontWeight: 500 }}>Allowed Domains</span>
              <span style={{
                color: '#1E293B',
                fontWeight: 600,
                textAlign: 'right',
                maxWidth: '160px',
                wordBreak: 'break-all',
              }}>
                {allowedDomains.join(', ')}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B', fontWeight: 500 }}>Connected AI Agent</span>
            <span style={{ color: '#1E293B', fontWeight: 600 }}>
              {provider === 'retell' ? 'Retell' : 'Vapi'} ({agentId ? `${agentId.slice(0, 8)}...` : 'Not Configured'})
            </span>
          </div>
        </div>
      </section>

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

      {/* ── Universal Embed ─────────────────────────────────────── */}
      <section>
        <h4 style={sectionTitle}>Embed on Your Website</h4>

        {/* Tab switcher: Script vs AI vs iframe */}
        <UniversalEmbedSection
          origin={origin}
          widgetId={widgetId}
          widgetName={widgetName}
          copied={copied}
          setCopied={setCopied}
        />
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

const codeStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  fontFamily: 'Consolas, Monaco, Courier New, monospace',
  color: '#E2E8F0',
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

