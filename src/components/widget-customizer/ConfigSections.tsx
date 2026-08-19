'use client';
import React from 'react';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import { inputStyle, labelStyle, rowStyle } from './formStyles';

interface Props {
  draft: VoiceWidgetConfig;
  onChange: (patch: Partial<VoiceWidgetConfig>) => void;
}

export function BrandingSection({ draft, onChange }: Props) {
  const set = (key: keyof typeof draft.branding, val: string) =>
    onChange({ branding: { [key]: val } as any });

  const fields: [keyof typeof draft.branding, string][] = [
    ['companyName',      'Company Name'],
    ['assistantName',    'Assistant Name'],
    ['title',            'Panel Title'],
    ['subtitle',         'Subtitle'],
    ['welcomeMessage',   'Welcome Message'],
    ['startLabel',       'Start Button Label'],
    ['connectingLabel',  'Connecting Label'],
    ['connectedLabel',   'Connected Label'],
    ['endLabel',         'End Call Label'],
    ['retryLabel',       'Retry Label'],
    ['muteLabel',        'Mute Label'],
    ['unmuteLabel',      'Unmute Label'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {fields.map(([key, label]) => (
        <div key={key}>
          <label style={labelStyle}>{label}</label>
          <input
            type="text"
            value={(draft.branding as any)[key] ?? ''}
            onChange={(e) => set(key, e.target.value)}
            style={inputStyle}
          />
        </div>
      ))}
    </div>
  );
}

export function TypographySection({ draft, onChange }: Props) {
  const set = (key: keyof typeof draft.typography, val: any) =>
    onChange({ typography: { [key]: val } as any });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Font Family</label>
        <input type="text" value={draft.typography.fontFamily} onChange={(e) => set('fontFamily', e.target.value)} style={inputStyle} />
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
    onChange({ launcher: { [key]: val } as any });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Variant</label>
        <select value={draft.launcher.variant} onChange={(e) => set('variant', e.target.value)} style={inputStyle}>
          <option value="icon">Icon Only</option>
          <option value="icon-label">Icon + Label</option>
          <option value="pill">Pill (text)</option>
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
    onChange({ panel: { [key]: val } as any });

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
        <select value={draft.theme.radius} onChange={(e) => onChange({ theme: { radius: e.target.value as any } } as any)} style={inputStyle}>
          {['none','sm','md','lg','xl','2xl','full'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Shadow</label>
        <select value={draft.theme.shadow} onChange={(e) => onChange({ theme: { shadow: e.target.value as any } } as any)} style={inputStyle}>
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
    onChange({ behavior: { [key]: val } as any });

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
    </div>
  );
}

export function ResponsiveSection({ draft, onChange }: Props) {
  const setR = (key: keyof typeof draft.responsive, val: any) =>
    onChange({ responsive: { [key]: val } as any });

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
