'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

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
          Create your first widget to embed an AI voice agent on any website.
        </p>
      </div>
      <button onClick={onNew} style={btn.primary}>
        <Icon d={ICONS.plus} size={14} />
        New Widget
      </button>
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

export default function WidgetsPage() {
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
  const [user, setUser] = useState<{ fullName: string; email: string } | null>(null);

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
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Inter', 'Figtree', system-ui, sans-serif" }}>
      {/* Responsive dashboard header & components style */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (max-width: 768px) {
          .dashboard-header {
            flex-direction: column !important;
            height: auto !important;
            padding: 16px !important;
            gap: 12px !important;
            align-items: stretch !important;
            position: relative !important;
          }
          .dashboard-header-left {
            justify-content: space-between !important;
            width: 100% !important;
          }
          .dashboard-header-right {
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
            gap: 10px !important;
          }
          .search-input {
            width: 100% !important;
          }
          .user-badge {
            border-left: none !important;
            padding-left: 0 !important;
            padding-top: 10px !important;
            border-top: 1px solid #E5E7EB !important;
            width: 100% !important;
            justify-content: space-between !important;
          }
          .card-actions {
            gap: 12px !important;
          }
          .flex-divider {
            display: none !important;
          }
        }
      `}} />

      {/* Header */}
      <header style={{
        height: '60px', background: '#FFFFFF', borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', position: 'sticky', top: 0, zIndex: 20,
      }} className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }} className="dashboard-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}>
              <Icon d={ICONS.widget} size={15} />
            </div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>Widget Fleet</span>
            {!loading && (
              <span style={{
                background: '#EFF6FF', color: '#1D4ED8',
                border: '1px solid #BFDBFE',
                borderRadius: '20px', padding: '1px 8px',
                fontSize: '11px', fontWeight: 600,
              }}>
                {widgets.length}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="dashboard-header-right">
          <input
            type="search"
            placeholder="Search widgets…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              height: '34px', padding: '0 12px',
              borderRadius: '8px', border: '1px solid #E5E7EB',
              fontSize: '13px', color: '#374151',
              background: '#F9FAFB', outline: 'none',
              width: '200px',
              fontFamily: 'inherit',
            }}
            className="search-input"
          />
          <Link
            href="/widget-customizer"
            style={{
              ...btn.primary, textDecoration: 'none', display: 'flex',
              alignItems: 'center', gap: '6px', justifyContent: 'center',
            }}
          >
            <Icon d={ICONS.plus} size={14} />
            New Widget
          </Link>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '8px', borderLeft: '1px solid #E5E7EB', paddingLeft: '12px' }} className="user-badge">
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
      </header>

      {/* Main */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Error */}
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
              <EmptyState onNew={() => window.location.href = '/widget-customizer'} />
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
      </main>

      {/* Delete modal */}
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
    height: '34px', padding: '0 14px', borderRadius: '8px',
    border: 'none', background: '#2563EB', color: '#fff',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontFamily: 'inherit',
  },
  secondary: {
    height: '34px', padding: '0 14px', borderRadius: '8px',
    border: '1px solid #E5E7EB', background: '#fff', color: '#374151',
    fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  danger: {
    height: '34px', padding: '0 14px', borderRadius: '8px',
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
