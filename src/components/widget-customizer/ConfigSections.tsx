'use client';
import React from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import { inputStyle, labelStyle, rowStyle, cardStyle } from './formStyles';
import AvatarUploader from './AvatarUploader';

interface Props {
  draft: VoiceWidgetConfig;
  onChange: (patch: Partial<VoiceWidgetConfig>) => void;
  widgetId?: string;
}

export function BrandingSection({ draft, onChange, widgetId = 'front-desk' }: Props) {
  const setBranding = (key: string, val: string) =>
    onChange({ branding: { ...draft.branding, [key]: val } as any });

  const setAvatar = (key: string, val: any) =>
    onChange({ avatar: { ...(draft.avatar || { size: 44, shape: 'circle' }), [key]: val } as any });

  const fields: [keyof typeof draft.branding, string][] = [
    ['companyName',      'Company / Brand Name'],
    ['assistantName',    'Assistant Name (Header Display)'],
    ['title',            'Panel Header Title'],
    ['subtitle',         'Subtitle / Description'],
    ['welcomeMessage',   'Initial Welcome Message'],
    ['placeholderText',  'Chat Input Placeholder'],
    ['agentMessageName', 'Agent Message Header'],
    ['userMessageName',  'User Message Header'],
    ['startLabel',       'Start Voice Call Label'],
    ['connectingLabel',  'Connecting Status Label'],
    ['connectedLabel',   'Connected Status Label'],
    ['endLabel',         'End Call Button Label'],
    ['retryLabel',       'Retry Button Label'],
    ['muteLabel',        'Mute Button Label'],
    ['unmuteLabel',      'Unmute Button Label'],
    ['errorMessage',     'Connection Error Message'],
    ['callEndedMessage', 'Call Ended Notice Message'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Avatar Sub-Card */}
      <div style={cardStyle}>
        <div style={rowStyle}>
          <span style={labelStyle}>Show Assistant Avatar</span>
          <label className="cust-toggle">
            <input
              type="checkbox"
              checked={draft.avatar?.enabled || false}
              onChange={(e) => setAvatar('enabled', e.target.checked)}
            />
            <span />
          </label>
        </div>

        {draft.avatar?.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {/* Avatar Image Upload */}
            <div>
              <label style={{ ...labelStyle, marginBottom: '8px', display: 'block' }}>Avatar Image</label>
              <AvatarUploader
                avatar={draft.avatar || {}}
                widgetId={widgetId}
                assistantName={draft.branding?.assistantName || 'AI'}
                onAvatarChange={(patch) =>
                  onChange({ avatar: { ...(draft.avatar || { enabled: true, size: 44, shape: 'circle' }), ...patch } as any })
                }
              />
            </div>
            {/* Fallback Initials */}
            <div>
              <label style={labelStyle}>Fallback Initials (e.g. FD)</label>
              <input
                type="text"
                placeholder="AI"
                value={draft.avatar?.fallbackText || ''}
                onChange={(e) => setAvatar('fallbackText', e.target.value)}
                style={inputStyle}
              />
            </div>
            {/* Avatar Shape */}
            <div>
              <label style={labelStyle}>Avatar Shape</label>
              <select
                value={draft.avatar?.shape || 'circle'}
                onChange={(e) => setAvatar('shape', e.target.value)}
                style={inputStyle}
              >
                <option value="circle">Circle</option>
                <option value="rounded">Rounded</option>
                <option value="square">Square</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {fields.map(([key, label]) => (
        <div key={key}>
          <label style={labelStyle}>{label}</label>
          <input
            type="text"
            value={(draft.branding as any)[key] ?? ''}
            onChange={(e) => setBranding(key, e.target.value)}
            style={inputStyle}
          />
        </div>
      ))}
    </div>
  );
}

export function TypographySection({ draft, onChange }: Props) {
  const set = (key: keyof typeof draft.typography, val: any) =>
    onChange({ typography: { ...draft.typography, [key]: val } as any });

  const FONT_PRESETS = [
    { label: 'Inter (Modern & Clean)', value: "'Inter', sans-serif" },
    { label: 'Figtree (Friendly Tech)', value: "'Figtree', sans-serif" },
    { label: 'Outfit (Modern Geometric)', value: "'Outfit', sans-serif" },
    { label: 'Plus Jakarta Sans (Premium SaaS)', value: "'Plus Jakarta Sans', sans-serif" },
    { label: 'Poppins (Soft Geometric)', value: "'Poppins', sans-serif" },
    { label: 'Roboto (Universal & Crisp)', value: "'Roboto', sans-serif" },
    { label: 'Montserrat (Bold Editorial)', value: "'Montserrat', sans-serif" },
    { label: 'Open Sans (Neutral & Readable)', value: "'Open Sans', sans-serif" },
    { label: 'Lato (Warm Corporate)', value: "'Lato', sans-serif" },
    { label: 'Space Grotesk (Tech Futuristic)', value: "'Space Grotesk', sans-serif" },
    { label: 'Playfair Display (Serif Luxury)', value: "'Playfair Display', serif" },
    { label: 'System UI (Native Fast)', value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  ];

  const currentFont = draft.typography.fontFamily || "'Figtree', sans-serif";
  const isPreset = FONT_PRESETS.some((p) => p.value.toLowerCase() === currentFont.toLowerCase());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Font Family</label>
        <select
          value={isPreset ? currentFont : 'custom'}
          onChange={(e) => {
            if (e.target.value !== 'custom') {
              set('fontFamily', e.target.value);
            }
          }}
          style={inputStyle}
        >
          {FONT_PRESETS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
          <option value="custom">Custom Font...</option>
        </select>
        {!isPreset && (
          <input
            type="text"
            placeholder="e.g. 'Inter', sans-serif"
            value={draft.typography.fontFamily}
            onChange={(e) => set('fontFamily', e.target.value)}
            style={{ ...inputStyle, marginTop: '6px' }}
          />
        )}
      </div>
      <div>
        <label style={labelStyle}>Font Size Scale</label>
        <select value={draft.typography.fontSizeScale} onChange={(e) => set('fontSizeScale', e.target.value)} style={inputStyle}>
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Heading Weight</label>
        <select value={String(draft.typography.headingWeight)} onChange={(e) => set('headingWeight', Number(e.target.value))} style={inputStyle}>
          {[400,500,600,700,800].map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Body Weight</label>
        <select value={String(draft.typography.bodyWeight)} onChange={(e) => set('bodyWeight', Number(e.target.value))} style={inputStyle}>
          {[300,400,500,600].map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Line Height</label>
        <input type="text" value={draft.typography.lineHeight ?? '1.5'} onChange={(e) => set('lineHeight', e.target.value)} style={inputStyle} />
      </div>
    </div>
  );
}

export function LauncherSection({ draft, onChange }: Props) {
  const set = (key: keyof typeof draft.launcher, val: any) =>
    onChange({ launcher: { ...draft.launcher, [key]: val } as any });

  const setLabel = (key: string, val: any) =>
    onChange({
      launcher: {
        ...draft.launcher,
        label: {
          ...(draft.launcher.label || { show: false, text: 'Talk to Agent', position: 'left' }),
          [key]: val,
        },
      } as any,
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Variant</label>
        <select value={draft.launcher.variant} onChange={(e) => set('variant', e.target.value)} style={inputStyle}>
          <option value="icon">Icon Only</option>
          <option value="icon-label">Icon + Text Label</option>
          <option value="pill">Pill (Text only)</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Icon</label>
        <select value={draft.launcher.icon} onChange={(e) => set('icon', e.target.value)} style={inputStyle}>
          {['phone','microphone','headset','message','chat','sparkles'].map(i => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Button Label Text</label>
        <input
          type="text"
          placeholder="Talk to Agent"
          value={draft.launcher.label?.text || ''}
          onChange={(e) => setLabel('text', e.target.value)}
          style={inputStyle}
        />
      </div>
      {draft.launcher.variant === 'icon' && (
        <div style={rowStyle}>
          <span style={labelStyle}>Show Floating Label Pill</span>
          <label className="cust-toggle">
            <input
              type="checkbox"
              checked={draft.launcher.label?.show || false}
              onChange={(e) => setLabel('show', e.target.checked)}
            />
            <span />
          </label>
        </div>
      )}
      <div>
        <label style={labelStyle}>Position</label>
        <select value={draft.launcher.position} onChange={(e) => set('position', e.target.value)} style={inputStyle}>
          {['bottom-right','bottom-left','top-right','top-left'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Shape</label>
        <select value={draft.launcher.shape} onChange={(e) => set('shape', e.target.value)} style={inputStyle}>
          {['circle','rounded','square','pill'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Size</label>
        <select value={String(draft.launcher.size)} onChange={(e) => set('size', e.target.value)} style={inputStyle}>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Custom Logo URL (Optional)</label>
        <input
          type="text"
          placeholder="https://example.com/logo.png"
          value={draft.launcher.logoSrc || ''}
          onChange={(e) => set('logoSrc', e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Pulse Animation</span>
        <label className="cust-toggle">
          <input type="checkbox" checked={draft.launcher.pulseAnimation} onChange={(e) => set('pulseAnimation', e.target.checked)} />
          <span />
        </label>
      </div>
      <div>
        <label style={labelStyle}>Tooltip</label>
        <input type="text" value={draft.launcher.tooltip} onChange={(e) => set('tooltip', e.target.value)} style={inputStyle} />
      </div>
    </div>
  );
}

export function PanelSection({ draft, onChange }: Props) {
  const set = (key: keyof typeof draft.panel, val: any) =>
    onChange({ panel: { ...draft.panel, [key]: val } as any });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Width (px)</label>
        <input type="number" value={Number(draft.panel.width) || 360} onChange={(e) => set('width', Number(e.target.value))} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Max Height (px)</label>
        <input type="number" value={Number(draft.panel.maxHeight) || 480} onChange={(e) => set('maxHeight', Number(e.target.value))} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Border Radius</label>
        <select value={draft.theme.radius} onChange={(e) => onChange({ theme: { ...draft.theme, radius: e.target.value as any } } as any)} style={inputStyle}>
          {['none','sm','md','lg','xl','2xl','full'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Shadow</label>
        <select value={draft.theme.shadow} onChange={(e) => onChange({ theme: { ...draft.theme, shadow: e.target.value as any } } as any)} style={inputStyle}>
          {['none','sm','md','lg','xl','2xl'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Show Header</span>
        <label className="cust-toggle">
          <input type="checkbox" checked={draft.panel.showHeader ?? true} onChange={(e) => set('showHeader', e.target.checked)} />
          <span />
        </label>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Show Close Button</span>
        <label className="cust-toggle">
          <input type="checkbox" checked={draft.panel.showCloseButton ?? true} onChange={(e) => set('showCloseButton', e.target.checked)} />
          <span />
        </label>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Show Tabs (Voice / Text)</span>
        <label className="cust-toggle">
          <input type="checkbox" checked={draft.panel.showTabs ?? true} onChange={(e) => set('showTabs', e.target.checked)} />
          <span />
        </label>
      </div>
    </div>
  );
}

export function BehaviorSection({ draft, onChange }: Props) {
  const set = (key: keyof typeof draft.behavior, val: any) =>
    onChange({ behavior: { ...draft.behavior, [key]: val } as any });

  const toggles: [keyof typeof draft.behavior, string][] = [
    ['showTranscript',   'Show Transcript'],
    ['showMuteButton',   'Show Mute Button'],
    ['showEndButton',    'Show End Button'],
    ['showAgentStatus',  'Show Agent Status'],
    ['showDuration',     'Show Duration'],
    ['showWaveform',     'Show Waveform'],
    ['allowTextChat',    'Allow Text Chat'],
    ['allowVoiceChat',   'Allow Voice Chat'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {toggles.map(([key, label]) => (
        <div key={key} style={rowStyle}>
          <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{label}</span>
          <label className="cust-toggle">
            <input type="checkbox" checked={!!draft.behavior[key]} onChange={(e) => set(key, e.target.checked)} />
            <span />
          </label>
        </div>
      ))}
      <div>
        <label style={labelStyle}>Default Tab</label>
        <select value={draft.behavior.defaultTab} onChange={(e) => set('defaultTab', e.target.value as any)} style={inputStyle}>
          <option value="voice">Voice</option>
          <option value="text">Text</option>
        </select>
      </div>

      {/* Agent-Initiated Navigation (Phase 9.1) */}
      <div style={{
        marginTop: '6px',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        background: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
              Allow Agent-Initiated Navigation
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', lineHeight: '1.4' }}>
              Let the agent open pages on your site during a conversation (e.g. inventory details, booking forms, financing). Optional &amp; off by default.
            </div>
          </div>
          <label className="cust-toggle" style={{ flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={!!draft.behavior.allowAgentNavigation}
              onChange={(e) => set('allowAgentNavigation', e.target.checked)}
            />
            <span />
          </label>
        </div>
      </div>

      {/* Hard Duration & Turn Caps (Cost & Abuse Protection) */}
      <div style={{
        marginTop: '6px',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        background: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
          Session Limits &amp; Cost Protection
        </div>

        <div>
          <label style={labelStyle}>Max Voice Call Duration (Minutes)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={draft.behavior.maxCallDurationMinutes ?? 10}
            onChange={(e) => set('maxCallDurationMinutes', Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 10)))}
            style={inputStyle}
          />
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
            Hard server-side limit. Live voice calls are automatically terminated when this duration is reached (default: 10 min).
          </div>
        </div>

        <div>
          <label style={labelStyle}>Max Chat Turns per Session</label>
          <input
            type="number"
            min={5}
            max={100}
            value={draft.behavior.maxChatTurns ?? 30}
            onChange={(e) => set('maxChatTurns', Math.max(5, Math.min(100, parseInt(e.target.value, 10) || 30)))}
            style={inputStyle}
          />
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
            Maximum user message turns allowed in a chat session before capping and directing visitor to direct contact (default: 30 turns).
          </div>
        </div>

        <div>
          <label style={labelStyle}>Initial Silence Timeout (Seconds)</label>
          <input
            type="number"
            min={5}
            max={60}
            value={draft.behavior.initialSilenceTimeoutSeconds ?? 15}
            onChange={(e) => set('initialSilenceTimeoutSeconds', Math.max(5, Math.min(60, parseInt(e.target.value, 10) || 15)))}
            style={inputStyle}
          />
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
            Automatically ends the call if the caller stays silent and never speaks during the initial window (default: 15s). Natural conversation pauses are unaffected.
          </div>
        </div>

        <div>
          <label style={labelStyle}>Daily Voice Call Quota (Circuit Breaker)</label>
          <input
            type="number"
            min={5}
            max={5000}
            value={draft.behavior.maxDailyCalls ?? 100}
            onChange={(e) => set('maxDailyCalls', Math.max(5, Math.min(5000, parseInt(e.target.value, 10) || 100)))}
            style={inputStyle}
          />
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
            Maximum allowed voice calls per day before the circuit breaker temporarily disables the assistant for cost protection (default: 100/day).
          </div>
        </div>

        <div>
          <label style={labelStyle}>Daily Chat Message Quota (Circuit Breaker)</label>
          <input
            type="number"
            min={10}
            max={20000}
            value={draft.behavior.maxDailyChats ?? 500}
            onChange={(e) => set('maxDailyChats', Math.max(10, Math.min(20000, parseInt(e.target.value, 10) || 500)))}
            style={inputStyle}
          />
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
            Maximum allowed chat messages per day before the circuit breaker trips (default: 500/day). Automatically resets at UTC midnight.
          </div>
        </div>

        <div>
          <label style={labelStyle}>Chat Rate Limit (Messages / Minute / Session)</label>
          <input
            type="number"
            min={1}
            max={120}
            value={draft.behavior.chatRateLimitPerMinute ?? 15}
            onChange={(e) => set('chatRateLimitPerMinute', Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 15)))}
            style={inputStyle}
          />
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
            Session-scoped rate limit. Throttles rapid message bursts per session independently of IP blocking (default: 15 msg/min).
          </div>
        </div>

        <div>
          <label style={labelStyle}>Max Message Length (Characters)</label>
          <input
            type="number"
            min={100}
            max={10000}
            value={draft.behavior.maxMessageCharacters ?? 1000}
            onChange={(e) => set('maxMessageCharacters', Math.max(100, Math.min(10000, parseInt(e.target.value, 10) || 1000)))}
            style={inputStyle}
          />
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
            Caps the length of individual user chat messages to prevent prompt injection and token abuse (default: 1,000 chars).
          </div>
        </div>
      </div>

      {/* Template Messages Library & Quick Prompts Manager (Task 5) */}
      <div style={{ ...cardStyle, marginTop: '8px', boxSizing: 'border-box', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>💬 Template Messages</div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', lineHeight: 1.3 }}>
              Clickable suggestion chips displayed to visitors on chat open.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const current = draft.behavior.templateMessages || [];
              const newItem = {
                id: String(Date.now()),
                label: 'New Inquiry',
                message: 'Can you tell me more about your offerings?',
                icon: '💡',
              };
              set('templateMessages', [...current, newItem]);
            }}
            style={{
              padding: '5px 8px',
              fontSize: '11px',
              fontWeight: 600,
              background: '#2F8FE0',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            + Add Prompt
          </button>
        </div>

        {/* Preset quick loaders */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 500 }}>Presets:</span>
          {[
            {
              name: '🎓 LMS',
              prompts: [
                { id: '1', label: 'Explore Programs', message: 'Which courses or programs do you offer?', icon: '🎓' },
                { id: '2', label: 'Pricing & Tuition', message: 'What are the tuition rates and pricing options?', icon: '💰' },
                { id: '3', label: 'Admissions & Enrollment', message: 'How do I apply and what are the admission requirements?', icon: '📝' },
                { id: '4', label: 'Talk to an Advisor', message: 'Can I speak with an advisor or instructor?', icon: '🗣️' },
              ],
            },
            {
              name: '🚗 Auto',
              prompts: [
                { id: '1', label: 'View Inventory', message: 'What vehicles do you currently have in stock?', icon: '🚗' },
                { id: '2', label: 'Book Service', message: 'I would like to schedule an oil change or maintenance service.', icon: '🔧' },
                { id: '3', label: 'Trade-in Value', message: 'How does your vehicle trade-in process work?', icon: '💵' },
                { id: '4', label: 'Financing Options', message: 'What financing or lease rates are available?', icon: '📄' },
              ],
            },
            {
              name: '💼 Business',
              prompts: [
                { id: '1', label: 'Our Services', message: 'What services does your company provide?', icon: '⚡' },
                { id: '2', label: 'Pricing & Plans', message: 'What are your rates and pricing packages?', icon: '🏷️' },
                { id: '3', label: 'Book Consultation', message: 'I want to schedule a discovery call or appointment.', icon: '📅' },
                { id: '4', label: 'Contact Support', message: 'How can I get in touch with your team directly?', icon: '📞' },
              ],
            },
          ].map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => set('templateMessages', preset.prompts)}
              style={{
                padding: '3px 6px',
                fontSize: '10.5px',
                background: '#F1F5F9',
                color: '#334155',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Template messages list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
          {(draft.behavior.templateMessages || []).map((item, idx) => (
            <div
              key={item.id || idx}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                boxSizing: 'border-box',
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
                <input
                  type="text"
                  placeholder="Emoji"
                  value={item.icon || ''}
                  onChange={(e) => {
                    const next = [...(draft.behavior.templateMessages || [])];
                    next[idx] = { ...next[idx], icon: e.target.value };
                    set('templateMessages', next);
                  }}
                  style={{ width: '34px', minWidth: '34px', padding: '5px 2px', fontSize: '13px', borderRadius: '6px', border: '1px solid #CBD5E1', textAlign: 'center', boxSizing: 'border-box' }}
                />
                <input
                  type="text"
                  placeholder="Chip Label (e.g. Explore Courses)"
                  value={item.label}
                  onChange={(e) => {
                    const next = [...(draft.behavior.templateMessages || [])];
                    next[idx] = { ...next[idx], label: e.target.value };
                    set('templateMessages', next);
                  }}
                  style={{ flex: 1, minWidth: 0, padding: '5px 8px', fontSize: '11.5px', fontWeight: 600, borderRadius: '6px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = (draft.behavior.templateMessages || []).filter((_, i) => i !== idx);
                    set('templateMessages', next);
                  }}
                  style={{
                    background: '#FEE2E2',
                    color: '#DC2626',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  title="Delete prompt"
                >
                  ✕
                </button>
              </div>
              <input
                type="text"
                placeholder="Message sent to AI (e.g. Which courses do you offer?)"
                value={item.message}
                onChange={(e) => {
                  const next = [...(draft.behavior.templateMessages || [])];
                  next[idx] = { ...next[idx], message: e.target.value };
                  set('templateMessages', next);
                }}
                style={{ width: '100%', minWidth: 0, padding: '5px 8px', fontSize: '11px', color: '#475569', borderRadius: '6px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResponsiveSection({ draft, onChange }: Props) {
  const setR = (key: keyof typeof draft.responsive, val: any) =>
    onChange({ responsive: { ...draft.responsive, [key]: val } as any });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Mobile Breakpoint (px)</label>
        <input type="number" value={draft.responsive.mobileBreakpoint} onChange={(e) => setR('mobileBreakpoint', Number(e.target.value))} style={inputStyle} />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Fullscreen on Mobile</span>
        <label className="cust-toggle">
          <input type="checkbox" checked={draft.responsive.fullscreenOnMobile} onChange={(e) => setR('fullscreenOnMobile', e.target.checked)} />
          <span />
        </label>
      </div>
    </div>
  );
}
