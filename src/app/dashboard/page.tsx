'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import PromptLibrary from '@/components/prompts/PromptLibrary';
import { Sparkles, BookOpen } from 'lucide-react';
import { FiPhone, FiMessageSquare, FiAlertTriangle, FiActivity, FiShield } from 'react-icons/fi';

interface WidgetSummary {
  id: string;
  name: string;
  provider: 'retell' | 'vapi';
  hasRetellKey: boolean;
  hasRetellAgentId: boolean;
  hasVapiKey: boolean;
  hasVapiAssistantId: boolean;
  config: any;
  createdAt: string;
  dailyUsage?: {
    calls: number;
    chats: number;
    maxCalls: number;
    maxChats: number;
    isCircuitBreakerTripped: boolean;
    trippedReason?: string;
    trippedAt?: number;
  };
}

// ── Icon helpers ───────────────────────────────────────────────────────────

function Icon({ d, size = 16 }: { d: string | string[]; size?: number }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  trash: ['M3 6h18', 'M19 6l-1 14H6L5 6', 'M8 6V4h8v2'],
  external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14L21 3'],
  key: ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4'],
  check: 'M20 6L9 17l-5-5',
  copy: ['M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M16 4h2a2 2 0 0 1 2 2v2', 'M8 4h8'],
  widget: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  back: 'M19 12H5M12 5l-7 7 7 7',
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  home: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
};

function ProviderBadge({ provider }: { provider: 'retell' | 'vapi' }) {
  const isRetell = provider === 'retell';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: 600,
      background: isRetell ? '#EFF6FF' : '#F5F3FF',
      color: isRetell ? '#1D4ED8' : '#6D28D9',
      border: `1px solid ${isRetell ? '#BFDBFE' : '#DDD6FE'}`,
    }}>
      {isRetell ? 'Retell AI' : 'Vapi AI'}
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span title={ok ? 'Configured' : 'Missing credential'} style={{
      display: 'inline-block',
      width: '7px', height: '7px',
      borderRadius: '50%',
      background: ok ? '#22C55E' : '#F59E0B',
      boxShadow: ok ? '0 0 0 2px rgba(34,197,94,0.25)' : '0 0 0 2px rgba(245,158,11,0.25)',
      flexShrink: 0,
    }} />
  );
}

function CredentialStatus({ widget }: { widget: WidgetSummary }) {
  const isRetell = widget.provider === 'retell';
  const hasKey = isRetell ? widget.hasRetellKey : widget.hasVapiKey;
  const hasAgent = isRetell ? widget.hasRetellAgentId : widget.hasVapiAssistantId;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#64748B' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <StatusDot ok={hasKey} /> API Key
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <StatusDot ok={hasAgent} /> {isRetell ? 'Agent' : 'Assistant'}
      </span>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flex: 1, gap: '16px', padding: '64px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '16px',
        background: 'linear-gradient(135deg, #EFF6FF, #F5F3FF)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#6366F1', border: '1px solid #E0E7FF',
      }}>
        <Icon d={ICONS.widget} size={28} />
      </div>
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
          No widgets yet
        </h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#6B7280', maxWidth: '280px' }}>
          Create your first widget to embed an AI voice and text agent on any website.
        </p>
      </div>
      <button onClick={onNew} style={btn.primary}>
        <Icon d={ICONS.plus} size={14} />
        New Widget
      </button>
    </div>
  );
}

function CreateWidgetModal({ onCancel, onCreate, isCreating }: {
  onCancel: () => void;
  onCreate: (name: string, slug: string, provider: 'retell' | 'vapi') => void;
  isCreating: boolean;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [provider, setProvider] = useState<'retell' | 'vapi'>('retell');
  const [customSlug, setCustomSlug] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!customSlug) {
      const generated = val.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setSlug(generated || '');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a widget name');
      return;
    }
    const finalSlug = (slug || name).toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-');
    onCreate(name.trim(), finalSlug, provider);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '28px 32px',
        maxWidth: '440px', width: '90%', boxShadow: '0 24px 48px rgba(0,0,0,0.16)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #2F8FE0, #1D6FB8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <Icon d={ICONS.widget} size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#111827' }}>
              Create New Voice Widget
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6B7280' }}>
              Set up a dedicated agent for your website or practice.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Widget Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. MedEaz Healthcare Assistant"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              style={{
                width: '100%', height: '38px', padding: '0 12px',
                borderRadius: '8px', border: '1px solid #D1D5DB',
                fontSize: '13.5px', color: '#111827', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Widget Identifier (Slug) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. medeaz-healthcare-assistant"
              value={slug}
              onChange={e => {
                setCustomSlug(true);
                setSlug(e.target.value);
              }}
              style={{
                width: '100%', height: '38px', padding: '0 12px',
                borderRadius: '8px', border: '1px solid #D1D5DB',
                fontSize: '13px', fontFamily: 'monospace', color: '#374151',
                background: '#F9FAFB', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Voice AI Engine
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setProvider('retell')}
                style={{
                  padding: '10px 12px', borderRadius: '8px',
                  border: provider === 'retell' ? '2px solid #2F8FE0' : '1px solid #E5E7EB',
                  background: provider === 'retell' ? '#EFF6FF' : '#FFFFFF',
                  color: provider === 'retell' ? '#1D4ED8' : '#374151',
                  fontWeight: 600, fontSize: '13px', cursor: 'pointer', textAlign: 'center',
                }}
              >
                Retell AI
              </button>
              <button
                type="button"
                onClick={() => setProvider('vapi')}
                style={{
                  padding: '10px 12px', borderRadius: '8px',
                  border: provider === 'vapi' ? '2px solid #6366F1' : '1px solid #E5E7EB',
                  background: provider === 'vapi' ? '#F5F3FF' : '#FFFFFF',
                  color: provider === 'vapi' ? '#6D28D9' : '#374151',
                  fontWeight: 600, fontSize: '13px', cursor: 'pointer', textAlign: 'center',
                }}
              >
                Vapi AI
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
            <button type="button" onClick={onCancel} style={{ ...btn.secondary, flex: 1 }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              style={{
                ...btn.primary, flex: 1, justifyContent: 'center',
                opacity: isCreating ? 0.7 : 1,
              }}
            >
              {isCreating ? 'Creating…' : 'Create & Customize'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ name, onCancel, onConfirm, isDeleting }: {
  name: string; onCancel: () => void; onConfirm: () => void; isDeleting: boolean;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '28px 32px',
        maxWidth: '380px', width: '90%', boxShadow: '0 24px 48px rgba(0,0,0,0.16)',
      }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#DC2626', marginBottom: '16px',
        }}>
          <Icon d={ICONS.trash} size={22} />
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
          Delete Widget
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#6B7280', lineHeight: 1.5 }}>
          Are you sure you want to delete <strong style={{ color: '#111827' }}>"{name}"</strong>?
          This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={{ ...btn.secondary, flex: 1 }}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              ...btn.danger, flex: 1,
              opacity: isDeleting ? 0.6 : 1,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
            }}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WidgetCard({ widget, onDelete, onCopySnippet, copiedId, origin }: {
  widget: WidgetSummary;
  onDelete: (id: string, name: string) => void;
  onCopySnippet: (id: string) => void;
  copiedId: string | null;
  origin: string;
}) {
  const isCopied = copiedId === widget.id;
  const agentId = widget.config?.provider?.agentId ?? '';
  const launcherColor = widget.config?.theme?.primaryColor ?? '#2F8FE0';

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: '14px',
      border: '1px solid #E5E7EB',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.02)',
      overflow: 'hidden',
      transition: 'box-shadow 0.2s, transform 0.2s',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08), 0 16px 32px rgba(0,0,0,0.04)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.02)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Color accent bar */}
      <div style={{ height: '4px', background: `linear-gradient(90deg, ${launcherColor}, ${launcherColor}99)` }} />

      <div style={{ padding: '20px 20px 16px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {widget.name}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <code style={{
                fontSize: '10px', fontFamily: 'monospace',
                background: '#F8FAFC', border: '1px solid #E2E8F0',
                borderRadius: '4px', padding: '1px 5px', color: '#64748B',
              }}>{widget.id}</code>
              <ProviderBadge provider={widget.provider} />
            </div>
          </div>
          {/* Widget mini preview dot */}
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: launcherColor,
            flexShrink: 0,
            boxShadow: `0 2px 8px ${launcherColor}60`,
          }} />
        </div>

        {/* Agent ID */}
        {agentId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <Icon d={ICONS.key[0] ?? ICONS.key} size={12} />
            <code style={{ fontSize: '10px', color: '#9CA3AF', fontFamily: 'monospace' }}>
              {agentId.length > 24 ? `${agentId.slice(0, 24)}…` : agentId}
            </code>
          </div>
        )}

        {/* Credential status */}
        <CredentialStatus widget={widget} />

        {/* Circuit Breaker Trip Indicator & Usage Status (Task C.3) */}
        {widget.dailyUsage?.isCircuitBreakerTripped ? (
          <div style={{
            marginTop: '12px',
            padding: '8px 10px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11.5px',
            color: '#991B1B',
            fontWeight: 600,
          }}>
            <FiAlertTriangle size={15} color="#DC2626" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div>Circuit Breaker Tripped</div>
              <div style={{ fontSize: '10px', color: '#B91C1C', fontWeight: 400, marginTop: '2px' }}>
                {widget.dailyUsage.trippedReason || 'Daily spend cap reached'} • Auto-resets midnight UTC
              </div>
            </div>
          </div>
        ) : (
          widget.dailyUsage && (
            <div style={{
              marginTop: '10px',
              padding: '8px 10px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748B' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: '#334155' }}>
                  <FiActivity size={12} color="#2563EB" />
                  <span>Daily Quota</span>
                </div>
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>Resets midnight UTC</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#475569' }}>
                  <FiPhone size={12} color="#059669" />
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{widget.dailyUsage.calls}</span>
                  <span style={{ color: '#94A3B8' }}>/ {widget.dailyUsage.maxCalls} calls</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#475569' }}>
                  <FiMessageSquare size={12} color="#2563EB" />
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{widget.dailyUsage.chats}</span>
                  <span style={{ color: '#94A3B8' }}>/ {widget.dailyUsage.maxChats} chats</span>
                </div>
              </div>
              {/* Visual dynamic percentage track */}
              {(() => {
                const callPct = Math.min(100, Math.round((widget.dailyUsage.calls / (widget.dailyUsage.maxCalls || 1)) * 100));
                const chatPct = Math.min(100, Math.round((widget.dailyUsage.chats / (widget.dailyUsage.maxChats || 1)) * 100));
                const maxPct = Math.max(callPct, chatPct);
                const barColor = maxPct > 85 ? '#EF4444' : maxPct > 60 ? '#F59E0B' : '#10B981';
                return (
                  <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(4, maxPct)}%`, height: '100%', background: barColor, borderRadius: '999px', transition: 'width 0.3s ease' }} />
                  </div>
                );
              })()}
            </div>
          )
        )}
      </div>

      {/* Footer actions */}
      <div style={{
        borderTop: '1px solid #F1F5F9', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: '8px',
        background: '#FAFBFC',
        flexWrap: 'wrap',
      }} className="card-actions">
        {/* Edit */}
        <Link
          href={`/widget-customizer?id=${encodeURIComponent(widget.id)}`}
          style={{
            ...btn.icon, color: '#374151', textDecoration: 'none', display: 'flex',
            alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 500,
          }}
        >
          <Icon d={ICONS.edit} size={13} /> Edit
        </Link>

        {/* Sandbox */}
        <a
          href={`/embed/${widget.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...btn.icon, color: '#374151', textDecoration: 'none', display: 'flex',
            alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 500,
          }}
        >
          <Icon d={ICONS.external} size={13} /> Preview
        </a>

        {/* Copy snippet */}
        <button
          onClick={() => onCopySnippet(widget.id)}
          style={{
            ...btn.icon, color: isCopied ? '#059669' : '#374151',
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '12px', fontWeight: 500,
          }}
        >
          <Icon d={isCopied ? ICONS.check : ICONS.copy} size={13} />
          {isCopied ? 'Copied!' : 'Copy Snippet'}
        </button>

        <div style={{ flex: '1 1 0' }} className="flex-divider" />

        {/* Delete */}
        <button
          onClick={() => onDelete(widget.id, widget.name)}
          style={{ ...btn.icon, color: '#DC2626' }}
          title="Delete widget"
        >
          <Icon d={ICONS.trash} size={14} />
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState(() => {
    if (process.env.BASE_URL) {
      return process.env.BASE_URL;
    }
    if (process.env.NEXT_PUBLIC_BASE_URL) {
      return process.env.NEXT_PUBLIC_BASE_URL;
    }
    return 'https://your-domain.vercel.app';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'widgets' | 'prompts'>('widgets');
  const [user, setUser] = useState<{ fullName: string; email: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (process.env.BASE_URL) {
      setOrigin(process.env.BASE_URL);
    } else if (process.env.NEXT_PUBLIC_BASE_URL) {
      setOrigin(process.env.NEXT_PUBLIC_BASE_URL);
    } else if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }

    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (err) {
        console.error('Failed to load user info:', err);
      }
    }
    loadUser();
  }, []);

  const handleCreate = useCallback(async (name: string, slug: string, provider: 'retell' | 'vapi') => {
    setIsCreating(true);
    const toastId = toast.loading('Creating new widget...');
    try {
      const res = await fetch('/api/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: slug,
          name: name,
          provider,
          config: {
            branding: {
              companyName: name,
              agentName: `${name} Agent`,
            },
          },
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to create widget');
      }

      const data = await res.json();
      toast.success('Widget created successfully!', { id: toastId });
      setShowCreateModal(false);
      window.location.href = `/widget-customizer?id=${encodeURIComponent(data.widget.id)}`;
    } catch (err: any) {
      toast.error(err.message || 'Failed to create widget', { id: toastId });
    } finally {
      setIsCreating(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    const toastId = toast.loading('Logging out...');
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        toast.success('Logged out successfully', { id: toastId });
        window.location.href = '/login';
      } else {
        toast.error('Logout failed', { id: toastId });
      }
    } catch (err) {
      toast.error('Logout error occurred', { id: toastId });
    }
  }, []);

  const fetchWidgets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/widgets');
      if (!res.ok) throw new Error('Failed to load widgets');
      const data = await res.json();
      setWidgets(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load widget list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWidgets(); }, [fetchWidgets]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const toastId = toast.loading(`Deleting widget "${deleteTarget.name}"...`);
    try {
      const res = await fetch(`/api/widgets?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to delete widget');
      }
      setWidgets(prev => prev.filter(w => w.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success('Widget deleted successfully!', { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete widget', { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget]);

  const handleCopySnippet = useCallback((id: string) => {
    const snippet = `<!-- Voice Agent Widget -->\n<script\n  src="${origin}/widget.js"\n  data-widget-id="${id}"\n  defer\n></script>`;
    navigator.clipboard.writeText(snippet)
      .then(() => {
        toast.success('Widget script code copied!');
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2500);
      })
      .catch(() => {
        toast.error('Failed to copy widget code.');
      });
  }, [origin]);

  const filteredWidgets = widgets.filter(w =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Figtree', system-ui, sans-serif" }}>
      {/* Responsive Dashboard Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .dashboard-desktop-nav {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .dashboard-hamburger-btn {
          display: none;
          background: none;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 6px 8px;
          cursor: pointer;
          color: #374151;
        }
        @media (max-width: 860px) {
          .dashboard-desktop-nav {
            display: none !important;
          }
          .dashboard-hamburger-btn {
            display: flex !important;
            align-items: center;
            justify-content: center;
          }
          .card-actions {
            gap: 10px !important;
          }
          .flex-divider {
            display: none !important;
          }
        }
      `}} />

      {/* Header */}
      <header style={{
        height: '64px', background: '#FFFFFF', borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', position: 'sticky', top: 0, zIndex: 30,
      }}>
        {/* Left branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: '#111827' }}>
            <img src="/logo.png" alt="Widgetized Logo" style={{ width: '30px', height: '30px', objectFit: 'contain' }} />
            <span style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em' }}>Widgetized</span>
          </Link>

          <span className="flex-divider" style={{ width: '1px', height: '20px', background: '#E5E7EB' }} />
          <span className="flex-divider" style={{ fontSize: '13px', color: '#6B7280', fontWeight: 500 }}>
            Fleet Command
          </span>
        </div>

        {/* Desktop Navigation & Actions */}
        <div className="dashboard-desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="search"
            placeholder="Search widgets…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              height: '36px', padding: '0 12px',
              borderRadius: '8px', border: '1px solid #E5E7EB',
              fontSize: '13px', color: '#374151',
              background: '#F9FAFB', outline: 'none',
              width: '180px',
              fontFamily: 'inherit',
            }}
          />

          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              ...btn.primary, display: 'inline-flex',
              alignItems: 'center', gap: '6px', justifyContent: 'center',
            }}
          >
            <Icon d={ICONS.plus} size={14} />
            New Widget
          </button>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '8px', borderLeft: '1px solid #E5E7EB', paddingLeft: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>{user.fullName}</span>
                <span style={{ fontSize: '10px', color: '#6B7280' }}>{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  ...btn.secondary,
                  height: '30px',
                  padding: '0 10px',
                  fontSize: '12px',
                  borderColor: '#DC2626',
                  color: '#DC2626',
                  background: 'transparent',
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Toggle Button */}
        <button
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="dashboard-hamburger-btn"
          aria-label="Toggle navigation menu"
        >
          <Icon d={mobileMenuOpen ? ICONS.close : ICONS.menu} size={18} />
        </button>
      </header>

      {/* Modern Slide-over Hamburger Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(5px)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
            animation: 'fadeInOverlay 0.2s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '310px',
              height: '100%',
              background: '#FFFFFF',
              boxShadow: '-8px 0 30px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 22px',
              boxSizing: 'border-box',
              animation: 'drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src="/logo.png" alt="Widgetized Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' }}>Widgetized</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#475569',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Close menu"
              >
                <Icon d={ICONS.close} size={18} />
              </button>
            </div>

            {/* Search Input in Drawer */}
            <div style={{ marginBottom: '16px' }}>
              <input
                type="search"
                placeholder="Search widgets…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  height: '40px', padding: '0 12px',
                  borderRadius: '9px', border: '1px solid #E2E8F0',
                  fontSize: '13px', color: '#374151',
                  background: '#F8FAFC', outline: 'none',
                  width: '100%',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Actions in Drawer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              <button
                onClick={() => {
                  setActiveTab('widgets');
                  setMobileMenuOpen(false);
                  setShowCreateModal(true);
                }}
                style={{
                  ...btn.primary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  justifyContent: 'center',
                  height: '42px',
                  width: '100%',
                  borderRadius: '9px',
                  fontSize: '13.5px',
                }}
              >
                <Icon d={ICONS.plus} size={15} />
                Create New Widget
              </button>
            </div>

            {/* User profile & Logout at bottom */}
            {user ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingTop: '16px', borderTop: '1px solid #F1F5F9', marginTop: 'auto',
              }}>
                <div style={{ overflow: 'hidden', paddingRight: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user.fullName}</div>
                  <div style={{ fontSize: '11px', color: '#6B7280', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user.email}</div>
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    ...btn.secondary,
                    borderColor: '#DC2626',
                    color: '#DC2626',
                    fontSize: '12px',
                    height: '32px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    flexShrink: 0,
                  }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', paddingTop: '16px', borderTop: '1px solid #F1F5F9', marginTop: 'auto' }}>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)} style={{ ...btn.secondary, flex: 1, textAlign: 'center', textDecoration: 'none', borderRadius: '8px' }}>
                  Login
                </Link>
                <Link href="/signup" onClick={() => setMobileMenuOpen(false)} style={{ ...btn.primary, flex: 1, textAlign: 'center', textDecoration: 'none', borderRadius: '8px' }}>
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Container */}
      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '24px 24px 48px' }}>
        {/* Navigation Tabs (Widgets vs Prompts) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#EEF2F6',
          padding: '4px',
          borderRadius: '12px',
          width: 'fit-content',
          marginBottom: '24px',
        }}>
          <button
            onClick={() => setActiveTab('widgets')}
            style={{
              padding: '8px 18px',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'widgets' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'widgets' ? '#0F172A' : '#64748B',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: activeTab === 'widgets' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Icon d={ICONS.widget} size={15} />
            My Voice Widgets ({widgets.length})
          </button>

          <button
            onClick={() => setActiveTab('prompts')}
            style={{
              padding: '8px 18px',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'prompts' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'prompts' ? '#2563EB' : '#64748B',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: activeTab === 'prompts' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <BookOpen size={15} />
            Prompt Library (10 Agents)
          </button>
        </div>

        {/* Tab Content: Prompt Library */}
        {activeTab === 'prompts' && (
          <PromptLibrary isEmbedded={true} />
        )}

        {/* Tab Content: Widgets */}
        {activeTab === 'widgets' && (
          <>
            {/* Error Notification */}
            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px',
                padding: '14px 18px', marginBottom: '24px', color: '#DC2626', fontSize: '13px',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <Icon d="M12 8v4M12 16h.01M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" size={16} />
                {error}
                <button onClick={fetchWidgets} style={{ marginLeft: 'auto', ...btn.secondary, fontSize: '12px' }}>Retry</button>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{
                    background: '#fff', borderRadius: '14px', border: '1px solid #E5E7EB',
                    height: '200px', animation: 'pulse 1.5s infinite',
                  }} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && filteredWidgets.length === 0 && (
              searchTerm ? (
                <div style={{ textAlign: 'center', padding: '64px 24px', color: '#9CA3AF', fontSize: '14px' }}>
                  No widgets matching "<strong style={{ color: '#374151' }}>{searchTerm}</strong>"
                </div>
              ) : (
                <div style={{ display: 'flex' }}>
                  <EmptyState onNew={() => setShowCreateModal(true)} />
                </div>
              )
            )}

            {/* Widget grid */}
            {!loading && filteredWidgets.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
                {filteredWidgets.map(widget => (
                  <WidgetCard
                    key={widget.id}
                    widget={widget}
                    onDelete={(id, name) => setDeleteTarget({ id, name })}
                    onCopySnippet={handleCopySnippet}
                    copiedId={copiedId}
                    origin={origin}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Create Widget Modal */}
      {showCreateModal && (
        <CreateWidgetModal
          onCancel={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          isCreating={isCreating}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

// ── Button style tokens ────────────────────────────────────────────────────

const btn: Record<string, React.CSSProperties> = {
  primary: {
    height: '36px', padding: '0 16px', borderRadius: '8px',
    border: 'none', background: '#2F8FE0', color: '#fff',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontFamily: 'inherit',
    boxShadow: '0 2px 6px rgba(47,143,224,0.25)',
  },
  secondary: {
    height: '36px', padding: '0 14px', borderRadius: '8px',
    border: '1px solid #E5E7EB', background: '#fff', color: '#374151',
    fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  danger: {
    height: '36px', padding: '0 14px', borderRadius: '8px',
    border: 'none', background: '#DC2626', color: '#fff',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  icon: {
    height: '30px', padding: '0 10px', borderRadius: '7px',
    border: '1px solid #E5E7EB', background: 'transparent',
    fontSize: '12px', fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
