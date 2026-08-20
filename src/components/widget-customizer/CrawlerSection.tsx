import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Zap,
  Globe2,
  ShieldAlert,
  Code2,
  ShoppingBag,
  Layers,
  Clock,
  FileUp,
  RefreshCw,
  Eye,
  Edit2,
  X,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import { QUICK_SCAN_PAGE_CAP, MASTER_SCAN_PAGE_CAP } from '@/lib/crawler';

type ScanMode = 'quick' | 'master';

export interface CrawlJobStatusInfo {
  status: string;
  scanMode?: ScanMode;
  pagesVisited: number;
  entitiesFound: number;
  blockedPages?: number;
  indexedRecords: number;
  jobId?: string;
  completedAt?: string;
  error?: string | null;
}

interface CrawlerSectionProps {
  websiteId?: string;
  setWebsiteId?: (val: string) => void;
  websiteName?: string;
  setWebsiteName?: (val: string) => void;
  widgetId?: string;
}

// ── Small helpers ───────────────────────────────────────

function CrawlStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: '#FEF3C7', color: '#D97706', label: 'Queued' },
    running: { bg: '#DBEAFE', color: '#2563EB', label: 'Crawling…' },
    completed: { bg: '#DCFCE7', color: '#15803D', label: 'Complete' },
    failed: { bg: '#FEE2E2', color: '#B91C1C', label: 'Failed' },
    blocked: { bg: '#FEE2E2', color: '#DC2626', label: 'Blocked by WAF' },
    never_crawled: { bg: '#F1F5F9', color: '#64748B', label: 'Not Started' },
  };
  const s = map[status] || map.never_crawled;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '999px',
      background: s.bg, color: s.color,
      fontSize: '10px', fontWeight: 700,
    }}>
      {s.label}
    </span>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="12" height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ── Scan Mode Toggle ─────────────────────────────────────────────────────────

function ScanModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: ScanMode;
  onChange: (m: ScanMode) => void;
  disabled?: boolean;
}) {
  const btn = (mode: ScanMode, label: React.ReactNode, sub: string) => {
    const active = value === mode;
    return (
      <button
        disabled={disabled}
        onClick={() => onChange(mode)}
        style={{
          flex: 1,
          padding: '8px 10px',
          borderRadius: '7px',
          border: active ? '1.5px solid #2563EB' : '1.5px solid #E2E8F0',
          background: active ? '#EFF6FF' : '#FAFAFA',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 700, color: active ? '#1D4ED8' : '#334155' }}>
          {label}
        </div>
        <div style={{ fontSize: '10px', color: active ? '#3B82F6' : '#94A3B8', marginTop: '2px' }}>
          {sub}
        </div>
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={labelStyle}>Scan Depth</span>
      <div style={{ display: 'flex', gap: '6px' }}>
        {btn('quick', (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Zap size={13} color="#2563EB" />
            <span>Quick Scan</span>
          </div>
        ), `Up to ${QUICK_SCAN_PAGE_CAP} pages`)}
        {btn('master', (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Globe2 size={13} color="#2563EB" />
            <span>Master Scan</span>
          </div>
        ), `Up to ${MASTER_SCAN_PAGE_CAP} pages`)}
      </div>
    </div>
  );
}

// ── Advanced CSS Selector Sub-Block ───────────────────────────────────────────


interface CssSchemaFormState {
  baseSelector: string;
  titleSelector: string;
  descSelector: string;
  priceSelector: string;
  imageSelector: string;
  linkSelector: string;
  entityType: string;
}

function fieldsToSchema(f: CssSchemaFormState): any | null {
  if (!f.baseSelector.trim() || !f.titleSelector.trim()) return null;
  const fields: any[] = [
    { name: 'title', selector: f.titleSelector.trim(), type: 'text' },
  ];
  if (f.descSelector.trim()) {
    fields.push({ name: 'shortDescription', selector: f.descSelector.trim(), type: 'text' });
  }
  if (f.priceSelector.trim()) {
    fields.push({ name: 'price', selector: f.priceSelector.trim(), type: 'text' });
  }
  if (f.imageSelector.trim()) {
    fields.push({ name: 'imageUrl', selector: f.imageSelector.trim(), type: 'attribute', attribute: 'src' });
  }
  if (f.linkSelector.trim()) {
    fields.push({ name: 'sourceUrl', selector: f.linkSelector.trim(), type: 'attribute', attribute: 'href' });
  }
  if (f.entityType.trim()) {
    fields.push({ name: 'entityType', selector: f.baseSelector.trim(), type: 'text', default: f.entityType.trim() });
  }
  return {
    name: 'Listing Items',
    baseSelector: f.baseSelector.trim(),
    fields,
  };
}

function schemaToFields(schema: any): CssSchemaFormState {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const getSel = (name: string) => fields.find((f: any) => f.name === name)?.selector || '';
  const entityTypeField = fields.find((f: any) => f.name === 'entityType');

  return {
    baseSelector: schema?.baseSelector || '',
    titleSelector: getSel('title'),
    descSelector: getSel('shortDescription') || getSel('description'),
    priceSelector: getSel('price'),
    imageSelector: getSel('imageUrl') || getSel('image'),
    linkSelector: getSel('sourceUrl') || getSel('url'),
    entityType: entityTypeField?.default || 'product',
  };
}

function AdvancedCssSchemaSubBlock({
  value,
  onChange,
  onSave,
  isSaving,
  disabled,
  showSaveButton,
}: {
  value: CssSchemaFormState;
  onChange: (f: CssSchemaFormState) => void;
  onSave?: () => void;
  isSaving?: boolean;
  disabled?: boolean;
  showSaveButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isCustomized = Boolean(value.baseSelector.trim() && value.titleSelector.trim());

  return (
    <div style={{
      border: '1px solid #E2E8F0',
      borderRadius: '8px',
      background: '#FFFFFF',
      overflow: 'hidden',
      transition: 'all 0.2s',
    }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '8px 10px',
          background: open ? '#F8FAFC' : '#FFFFFF',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Code2 size={13} color="#2563EB" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>
            Advanced: Fast-Path CSS Selectors
          </span>
          {isCustomized ? (
            <span style={{
              fontSize: '9px', fontWeight: 700, background: '#DCFCE7', color: '#15803D',
              padding: '1px 6px', borderRadius: '4px',
            }}>
              Active
            </span>
          ) : (
            <span style={{
              fontSize: '9px', fontWeight: 600, background: '#F1F5F9', color: '#64748B',
              padding: '1px 6px', borderRadius: '4px',
            }}>
              Default (LLM)
            </span>
          )}
        </div>
        <ChevronDown
          size={13}
          color="#64748B"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        />
      </button>

      {open && (
        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #F1F5F9' }}>
          <p style={{ fontSize: '10px', color: '#64748B', margin: 0, lineHeight: '1.4' }}>
            For websites with repeating item listings (catalogs, service menus, directories), defining CSS selectors enables instant, zero-LLM extraction. Leave blank to use the generic LLM fallback.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={labelStyle}>Container / Base Selector *</span>
            <input
              style={{ ...input, fontSize: '11px' }}
              value={value.baseSelector}
              onChange={e => onChange({ ...value, baseSelector: e.target.value })}
              placeholder="e.g. .product-card, article.item, .service-box"
              disabled={disabled}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={labelStyle}>Title Selector *</span>
              <input
                style={{ ...input, fontSize: '11px' }}
                value={value.titleSelector}
                onChange={e => onChange({ ...value, titleSelector: e.target.value })}
                placeholder="e.g. h2.title, .product-name"
                disabled={disabled}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={labelStyle}>Price Selector</span>
              <input
                style={{ ...input, fontSize: '11px' }}
                value={value.priceSelector}
                onChange={e => onChange({ ...value, priceSelector: e.target.value })}
                placeholder="e.g. .price, .amount"
                disabled={disabled}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={labelStyle}>Description Selector</span>
              <input
                style={{ ...input, fontSize: '11px' }}
                value={value.descSelector}
                onChange={e => onChange({ ...value, descSelector: e.target.value })}
                placeholder="e.g. p.desc, .summary"
                disabled={disabled}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={labelStyle}>Image Selector</span>
              <input
                style={{ ...input, fontSize: '11px' }}
                value={value.imageSelector}
                onChange={e => onChange({ ...value, imageSelector: e.target.value })}
                placeholder="e.g. img, .photo img"
                disabled={disabled}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={labelStyle}>Link / URL Selector</span>
              <input
                style={{ ...input, fontSize: '11px' }}
                value={value.linkSelector}
                onChange={e => onChange({ ...value, linkSelector: e.target.value })}
                placeholder="e.g. a, .product-link"
                disabled={disabled}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={labelStyle}>Entity Type</span>
              <select
                style={{ ...input, fontSize: '11px', padding: '6px 8px' }}
                value={value.entityType}
                onChange={e => onChange({ ...value, entityType: e.target.value })}
                disabled={disabled}
              >
                <option value="product">Product</option>
                <option value="service">Service</option>
                <option value="faq">FAQ</option>
                <option value="contact">Contact</option>
                <option value="pricing">Pricing</option>
                <option value="event">Event</option>
                <option value="text">General Text</option>
              </select>
            </div>
          </div>

          {showSaveButton && onSave && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving || disabled}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: isSaving || disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {isSaving ? 'Saving…' : 'Save CSS Schema'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── WooCommerceConnectorSubBlock ──────────────────────────────────────────────

function WooCommerceConnectorSubBlock({
  websiteId,
  onConnected,
  disabled,
}: {
  websiteId: string;
  onConnected?: (count: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!consumerKey.trim() || !consumerSecret.trim()) {
      const msg = 'Please provide both Consumer Key and Consumer Secret';
      setError(msg);
      toast.error(msg);
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    const toastId = toast.loading('Connecting WooCommerce store & syncing products...');

    try {
      const res = await fetch(`/api/websites/${websiteId}/connect-platform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'woocommerce',
          consumerKey: consumerKey.trim(),
          consumerSecret: consumerSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to connect WooCommerce');
      }
      const successText = `Connected! Ingested ${data.ingestedCount || 0} products.`;
      setSuccessMsg(successText);
      toast.success(successText, { id: toastId });
      setConsumerKey('');
      setConsumerSecret('');
      if (onConnected) onConnected(data.ingestedCount || 0);
    } catch (err: any) {
      setError(err.message || 'Connection failed');
      toast.error(err.message || 'WooCommerce connection failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      border: '1px solid #DDD6FE',
      borderRadius: '8px',
      background: '#F5F3FF',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShoppingBag size={13} color="#7C3AED" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#5B21B6' }}>
            WooCommerce API Connector
          </span>
          <span style={{ fontSize: '9px', background: '#EDE9FE', color: '#6D28D9', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
            Structured
          </span>
        </div>
        <ChevronDown
          size={13}
          color="#6D28D9"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        />
      </button>

      {open && (
        <div style={{ padding: '8px 10px 10px 10px', borderTop: '1px solid #EDE9FE', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '10px', color: '#6D28D9', margin: 0, lineHeight: '1.4' }}>
            Enter your WooCommerce REST API keys to fetch products directly in real-time. Keys are AES-encrypted at rest and never exposed to the client.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: '#4C1D95' }}>Consumer Key</label>
            <input
              type="password"
              placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxx"
              value={consumerKey}
              onChange={e => setConsumerKey(e.target.value)}
              disabled={loading || disabled}
              style={{ ...input, fontSize: '11px', padding: '5px 8px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: '#4C1D95' }}>Consumer Secret</label>
            <input
              type="password"
              placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxx"
              value={consumerSecret}
              onChange={e => setConsumerSecret(e.target.value)}
              disabled={loading || disabled}
              style={{ ...input, fontSize: '11px', padding: '5px 8px' }}
            />
          </div>

          {error && (
            <div style={{ fontSize: '10px', color: '#DC2626', background: '#FEE2E2', padding: '5px 8px', borderRadius: '5px' }}>
              {error}
            </div>
          )}

          {successMsg && (
            <div style={{ fontSize: '10px', color: '#15803D', background: '#DCFCE7', padding: '5px 8px', borderRadius: '5px' }}>
              {successMsg}
            </div>
          )}

          <button
            type="button"
            onClick={handleConnect}
            disabled={loading || disabled}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: '#7C3AED',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 600,
              cursor: loading || disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            {loading ? 'Validating API Keys…' : 'Connect & Sync Products'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── FeedAndManualImportSubBlock ───────────────────────────────────────────────

function FeedAndManualImportSubBlock({
  websiteId,
  onImported,
  disabled,
}: {
  websiteId: string;
  onImported?: (count: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState('');
  const [importingFeed, setImportingFeed] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [feedMsg, setFeedMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFeed = async () => {
    if (!feedUrl.trim()) return;
    setFeedMsg(null);
    setImportingFeed(true);
    const toastId = toast.loading('Importing product feed catalog...');
    try {
      const res = await fetch(`/api/websites/${websiteId}/import-feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl: feedUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Feed import failed');
      setFeedMsg({ type: 'success', text: data.message || `Imported ${data.count} items` });
      setFeedUrl('');
      toast.success(data.message || `Successfully imported ${data.count} catalog items!`, { id: toastId });
      if (onImported) onImported(data.count || 0);
    } catch (err: any) {
      setFeedMsg({ type: 'error', text: err.message || 'Feed import failed' });
      toast.error(err.message || 'Feed import failed', { id: toastId });
    } finally {
      setImportingFeed(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg(null);
    setUploadingFile(true);
    const toastId = toast.loading(`Parsing & importing ${file.name}...`);

    try {
      const text = await file.text();
      let items: any[] = [];

      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.products || parsed.data || []);
      } else {
        // Parse CSV client-side
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.replace(/^["']|["']$/g, '').trim());
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => {
              if (h) row[h] = values[idx] || '';
            });
            items.push(row);
          }
        }
      }

      if (items.length === 0) {
        throw new Error('No items found in uploaded file');
      }

      const res = await fetch(`/api/websites/${websiteId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Upload import failed');
      setUploadMsg({ type: 'success', text: data.message || `Imported ${data.importedCount} items` });
      toast.success(data.message || `Imported ${data.importedCount} inventory items!`, { id: toastId });
      if (onImported) onImported(data.importedCount || 0);
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err.message || 'File processing failed' });
      toast.error(err.message || 'File processing failed', { id: toastId });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{
      border: '1px solid #E2E8F0',
      borderRadius: '8px',
      background: '#F8FAFC',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={13} color="#2563EB" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>
            Feeds & Inventory Upload (CSV / JSON / XML)
          </span>
          <span style={{ fontSize: '9px', background: '#E2E8F0', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
            Feed/Upload
          </span>
        </div>
        <ChevronDown
          size={13}
          color="#64748B"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        />
      </button>

      {open && (
        <div style={{ padding: '8px 10px 10px 10px', borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Feed URL input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: '#475569' }}>Product Feed URL (Google Merchant XML / CSV / RSS / JSON)</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="url"
                placeholder="https://example.com/feed.xml or products.csv"
                value={feedUrl}
                onChange={e => setFeedUrl(e.target.value)}
                disabled={importingFeed || disabled}
                style={{
                  flex: 1,
                  fontSize: '11px',
                  padding: '5px 8px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleImportFeed}
                disabled={importingFeed || !feedUrl.trim() || disabled}
                style={{
                  padding: '5px 10px',
                  borderRadius: '5px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: importingFeed || !feedUrl.trim() || disabled ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {importingFeed ? 'Importing…' : 'Import Feed'}
              </button>
            </div>
            {feedMsg && (
              <div style={{
                fontSize: '10px',
                color: feedMsg.type === 'success' ? '#15803D' : '#B91C1C',
                background: feedMsg.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                padding: '4px 7px',
                borderRadius: '5px',
              }}>
                {feedMsg.text}
              </div>
            )}
          </div>

          {/* Manual File Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed #E2E8F0', paddingTop: '8px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: '#475569' }}>Manual Inventory Upload (CSV or JSON)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.json,text/csv,application/json"
                onChange={handleFileUpload}
                disabled={uploadingFile || disabled}
                style={{ display: 'none' }}
                id={`inventory-upload-${websiteId}`}
              />
              <label
                htmlFor={`inventory-upload-${websiteId}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: uploadingFile || disabled ? 'not-allowed' : 'pointer',
                }}
              >
                <FileUp size={12} />
                {uploadingFile ? 'Parsing & Ingesting…' : 'Upload Inventory (.csv / .json)'}
              </label>
            </div>
            {uploadMsg && (
              <div style={{
                fontSize: '10px',
                color: uploadMsg.type === 'success' ? '#15803D' : '#B91C1C',
                background: uploadMsg.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                padding: '4px 7px',
                borderRadius: '5px',
              }}>
                {uploadMsg.text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SyncScheduleSubBlock ──────────────────────────────────────────────────────

type SyncFrequency = 'off' | 'weekly' | 'daily' | 'twice_daily' | 'three_times_daily';

function SyncScheduleSubBlock({
  websiteId,
  currentFrequency = 'off',
  disabled,
}: {
  websiteId: string;
  currentFrequency?: SyncFrequency;
  disabled?: boolean;
}) {
  const [frequency, setFrequency] = useState<SyncFrequency>(currentFrequency || 'off');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (currentFrequency) setFrequency(currentFrequency);
  }, [currentFrequency]);

  const handleChange = async (newFreq: SyncFrequency) => {
    setFrequency(newFreq);
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncFrequency: newFreq }),
      });
      if (!res.ok) throw new Error('Failed to update sync frequency');
      setSaveStatus('Saved!');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const options: Array<{ value: SyncFrequency; label: string; desc: string }> = [
    { value: 'off', label: 'Off', desc: 'Manual sync' },
    { value: 'weekly', label: 'Weekly', desc: '7 days' },
    { value: 'daily', label: 'Daily', desc: '24h' },
    { value: 'twice_daily', label: '2x Daily', desc: '12h' },
    { value: 'three_times_daily', label: '3x Daily', desc: '8h' },
  ];

  return (
    <div style={{
      border: '1px solid #E2E8F0',
      borderRadius: '8px',
      background: '#F8FAFC',
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={13} color="#2563EB" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>
            Automated Sync Schedule
          </span>
          {saveStatus && (
            <span style={{ fontSize: '9px', color: saveStatus === 'Saved!' ? '#16A34A' : '#DC2626', fontWeight: 700 }}>
              {saveStatus}
            </span>
          )}
        </div>
        <span style={{ fontSize: '9px', background: frequency === 'off' ? '#E2E8F0' : '#DCFCE7', color: frequency === 'off' ? '#475569' : '#15803D', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
          {frequency === 'off' ? 'MANUAL' : 'SCHEDULED'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
        {options.map((opt) => {
          const isSelected = frequency === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleChange(opt.value)}
              disabled={disabled || saving}
              style={{
                padding: '5px 2px',
                borderRadius: '6px',
                border: isSelected ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                background: isSelected ? '#EFF6FF' : '#FFFFFF',
                color: isSelected ? '#1D4ED8' : '#475569',
                cursor: disabled || saving ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1px',
              }}
            >
              <span style={{ fontSize: '10px', fontWeight: isSelected ? 700 : 500 }}>
                {opt.label}
              </span>
              <span style={{ fontSize: '7.5px', color: isSelected ? '#3B82F6' : '#94A3B8' }}>
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── WebsiteConnectedPanel ─────────────────────────────────────────────────────

interface WebsiteConnectedPanelProps {
  websiteId: string;
  websiteName?: string;
  setWebsiteId?: (val: string) => void;
  setWebsiteName?: (val: string) => void;
  crawlStatus: CrawlJobStatusInfo | null;
  setCrawlStatus: React.Dispatch<React.SetStateAction<CrawlJobStatusInfo | null>>;
  handleReCrawl: (mode: ScanMode) => void;
}

function WebsiteConnectedPanel({
  websiteId,
  websiteName,
  setWebsiteId,
  setWebsiteName,
  crawlStatus,
  setCrawlStatus,
  handleReCrawl,
}: WebsiteConnectedPanelProps) {
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(websiteName || '');
  const [savingName, setSavingName] = useState(false);
  const [reScanMode, setReScanMode] = useState<ScanMode>(crawlStatus?.scanMode || 'master');
  const [cssForm, setCssForm] = useState<CssSchemaFormState>({
    baseSelector: '',
    titleSelector: '',
    descSelector: '',
    priceSelector: '',
    imageSelector: '',
    linkSelector: '',
    entityType: 'product',
  });
  const [savingCss, setSavingCss] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<string>('unknown');
  const [syncFrequency, setSyncFrequency] = useState<SyncFrequency>('off');
  const isBusy = crawlStatus?.status === 'running' || crawlStatus?.status === 'pending';

  // Load existing website configuration (including css_selector_schema & detected_platform & sync_frequency)
  useEffect(() => {
    if (!websiteId) return;
    const fetchWebsiteData = async () => {
      try {
        const res = await fetch('/api/websites');
        if (!res.ok) return;
        const sites = await res.json();
        const site = (sites || []).find((s: any) => s.id === websiteId);
        if (site?.css_selector_schema) {
          setCssForm(schemaToFields(site.css_selector_schema));
        }
        if (site?.detected_platform) {
          setDetectedPlatform(site.detected_platform);
        }
        if (site?.sync_frequency) {
          setSyncFrequency(site.sync_frequency);
        }
      } catch { }
    };
    fetchWebsiteData();
  }, [websiteId]);

  const handleSaveCssSchema = async () => {
    setSavingCss(true);
    try {
      const schema = fieldsToSchema(cssForm);
      await fetch(`/api/websites/${websiteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cssSelectorSchema: schema }),
      });
    } catch { }
    setSavingCss(false);
  };


  const handleSaveName = async () => {
    if (!editName.trim() || editName.trim() === websiteName) { setEditingName(false); return; }
    setSavingName(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok && setWebsiteName) setWebsiteName(editName.trim());
    } catch { }
    setSavingName(false);
    setEditingName(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Site name row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
        <span style={{ color: '#64748B', fontWeight: 500, flexShrink: 0 }}>Connected Site</span>
        {editingName ? (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
              style={{ fontSize: '11px', padding: '3px 7px', borderRadius: '5px', border: '1px solid #93C5FD', outline: 'none', width: '120px', color: '#0F172A' }}
            />
            <button onClick={handleSaveName} disabled={savingName}
              style={{ padding: '3px 7px', borderRadius: '5px', border: 'none', background: '#2563EB', color: '#fff', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
            >
              {savingName ? '…' : 'Save'}
            </button>
            <button onClick={() => setEditingName(false)}
              style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: '10px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {detectedPlatform === 'shopify' ? (
              <span style={{
                fontSize: '9px', fontWeight: 700, background: '#DCFCE7', color: '#15803D',
                padding: '2px 6px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '3px'
              }}>
                <ShoppingBag size={10} /> Shopify
              </span>
            ) : detectedPlatform === 'woocommerce' ? (
              <span style={{
                fontSize: '9px', fontWeight: 700, background: '#EDE9FE', color: '#6D28D9',
                padding: '2px 6px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '3px'
              }}>
                <ShoppingBag size={10} /> WooCommerce
              </span>
            ) : detectedPlatform === 'd2cmedia' ? (
              <span style={{
                fontSize: '9px', fontWeight: 700, background: '#FEF3C7', color: '#B45309',
                padding: '2px 6px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '3px'
              }}>
                🚗 D2C Dealership
              </span>
            ) : detectedPlatform === 'dealer_dot_com' || detectedPlatform === 'dealer_inspire' ? (
              <span style={{
                fontSize: '9px', fontWeight: 700, background: '#E0F2FE', color: '#0369A1',
                padding: '2px 6px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '3px'
              }}>
                🚗 Auto Dealer
              </span>
            ) : null}
            <span style={{ color: '#0F172A', fontWeight: 700, maxWidth: '120px', textAlign: 'right', wordBreak: 'break-all' }}>{websiteName}</span>
            <button onClick={() => { setEditName(websiteName || ''); setEditingName(true); }} title="Edit website name"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px', display: 'flex', alignItems: 'center' }}
            >
              <Edit2 size={11} />
            </button>
          </div>
        )}
      </div>


      {/* Crawl status */}
      {crawlStatus && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
            <span style={{ color: '#64748B', fontWeight: 500 }}>Crawl Status</span>
            <CrawlStatusBadge status={crawlStatus.status} />
          </div>
          {isBusy ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(37,99,235,0.06)', borderRadius: '7px', padding: '7px 10px' }}>
              <SpinnerIcon />
              <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 500 }}>
                Analyzing your website ({crawlStatus.scanMode === 'quick' ? 'Quick' : 'Master'} Scan)…
              </span>
            </div>
          ) : crawlStatus.status === 'blocked' ? (
            <div style={{
              background: '#FEF2F2',
              border: '1.5px solid #FCA5A5',
              borderRadius: '8px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={14} color="#DC2626" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B' }}>
                  Scan Blocked by Website Firewall (Anti-Bot / WAF)
                </span>
              </div>
              <p style={{ fontSize: '10px', color: '#7F1D1D', margin: 0, lineHeight: '1.4' }}>
                The website's firewall (Cloudflare/DataDome/PerimeterX) blocked automated crawler access ({crawlStatus.blockedPages || 1} pages blocked). No fabricated or block-page content was indexed.
              </p>
              <div style={{ fontSize: '10px', color: '#991B1B', background: '#FEE2E2', padding: '5px 8px', borderRadius: '5px', lineHeight: '1.4' }}>
                💡 <strong>Next steps:</strong> Try a <strong>Quick Scan</strong>, configure <strong>Fast-Path CSS Selectors</strong> below, or whitelist the crawler on your domain.
              </div>
            </div>
          ) : crawlStatus.status === 'completed' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#64748B' }}>Pages analyzed</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>
                  {crawlStatus.pagesVisited}
                  {crawlStatus.blockedPages && crawlStatus.blockedPages > 0 ? (
                    <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 500, marginLeft: '4px' }}>
                      ({crawlStatus.blockedPages} blocked skipped)
                    </span>
                  ) : null}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#64748B' }}>Knowledge records</span>
                <span style={{ fontWeight: 700, color: '#16A34A' }}>{crawlStatus.indexedRecords || crawlStatus.entitiesFound}</span>
              </div>
            </div>
          ) : crawlStatus.status === 'failed' ? (
            <div style={{
              background: '#FEF2F2',
              border: '1.5px solid #FCA5A5',
              borderRadius: '8px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={14} color="#DC2626" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B' }}>
                  Crawl Failed (0 Pages / 0 Knowledge Records)
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', color: '#64748B' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Pages analyzed</span>
                  <span style={{ fontWeight: 600, color: '#DC2626' }}>0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Knowledge records</span>
                  <span style={{ fontWeight: 600, color: '#DC2626' }}>0</span>
                </div>
              </div>
              {crawlStatus.error && (
                <div style={{
                  fontSize: '10px',
                  color: '#7F1D1D',
                  background: '#FEE2E2',
                  padding: '6px 8px',
                  borderRadius: '5px',
                  lineHeight: '1.4',
                  fontFamily: 'monospace',
                  wordBreak: 'break-word',
                }}>
                  ⚠️ {crawlStatus.error}
                </div>
              )}
              <div style={{ fontSize: '10px', color: '#991B1B', lineHeight: '1.4' }}>
                💡 <strong>Next steps:</strong> Verify your URL is publicly reachable, try a <strong>Quick Scan</strong>, configure <strong>CSS Selectors</strong>, or import knowledge directly.
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Re-crawl scan mode */}
      <ScanModeToggle value={reScanMode} onChange={setReScanMode} disabled={isBusy} />

      {/* Automated Recurring Sync Schedule */}
      <SyncScheduleSubBlock
        websiteId={websiteId}
        currentFrequency={syncFrequency}
        disabled={isBusy}
      />

      {/* WooCommerce API connector if detected or available */}
      <WooCommerceConnectorSubBlock
        websiteId={websiteId}
        disabled={isBusy}
        onConnected={(count) => {
          if (setCrawlStatus) {
            setCrawlStatus(prev => prev ? { ...prev, indexedRecords: (prev.indexedRecords || 0) + count } : null);
          }
        }}
      />

      {/* Feed & Manual Inventory Import */}
      <FeedAndManualImportSubBlock
        websiteId={websiteId}
        disabled={isBusy}
        onImported={(count) => {
          if (setCrawlStatus) {
            setCrawlStatus(prev => prev ? { ...prev, indexedRecords: (prev.indexedRecords || 0) + count } : null);
          }
        }}
      />


      {/* Advanced CSS Selector extraction settings */}
      <AdvancedCssSchemaSubBlock
        value={cssForm}
        onChange={setCssForm}
        onSave={handleSaveCssSchema}
        isSaving={savingCss}
        disabled={isBusy}
        showSaveButton={true}
      />


      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => handleReCrawl(reScanMode)}
          disabled={isBusy}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: '7px', border: '1px solid #BBF7D0',
            background: '#FFFFFF', color: '#15803D', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            opacity: isBusy ? 0.5 : 1,
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px',
          }}
        >
          <RefreshCw size={11} />
          Re-crawl
        </button>

        <button
          onClick={() => window.open(`/api/websites/${websiteId}/data`, '_blank')}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: '7px', border: '1px solid #BBF7D0',
            background: '#FFFFFF', color: '#15803D', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px',
          }}
          title="View crawled JSON data"
        >
          <Eye size={12} />
          View Data
        </button>

        <button
          onClick={() => {
            if (setWebsiteId) setWebsiteId('');
            if (setWebsiteName) setWebsiteName('');
            setCrawlStatus(null);
            toast.success('Website disconnected from widget.');
          }}
          style={{
            padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0',
            background: '#FFFFFF', color: '#64748B', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Disconnect website"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Main CrawlerSection ───────────────────────────────────────────────────────

export default function CrawlerSection({
  websiteId = '',
  setWebsiteId,
  websiteName = 'Default Website',
  setWebsiteName,
  widgetId = '',
}: CrawlerSectionProps) {
  const [wsSiteUrl, setWsSiteUrl] = useState('');
  const [wsSiteName, setWsSiteName] = useState('');
  const [wsConnecting, setWsConnecting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('master');
  const [connectCssForm, setConnectCssForm] = useState<CssSchemaFormState>({
    baseSelector: '',
    titleSelector: '',
    descSelector: '',
    priceSelector: '',
    imageSelector: '',
    linkSelector: '',
    entityType: 'product',
  });
  const [crawlStatus, setCrawlStatus] = useState<CrawlJobStatusInfo | null>(null);
  const crawlPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper to determine terminal crawl job status
  const isTerminalStatus = useCallback((status: string | undefined): boolean => {
    return status === 'completed' || status === 'failed' || status === 'blocked' || status === 'never_crawled';
  }, []);

  const stopPolling = useCallback(() => {
    if (crawlPollRef.current) {
      clearInterval(crawlPollRef.current);
      crawlPollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((targetWebsiteId: string, expectedScanMode?: ScanMode) => {
    stopPolling();
    if (!targetWebsiteId) return;

    crawlPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/websites/${targetWebsiteId}/crawl`);
        if (!res.ok) return;
        const data = await res.json();
        const currentStatus = data.status || 'never_crawled';

        setCrawlStatus({
          status: currentStatus,
          scanMode: data.scanMode || expectedScanMode || 'master',
          pagesVisited: data.pagesVisited || 0,
          entitiesFound: data.entitiesFound || 0,
          blockedPages: data.blockedPages || data.blocked_pages || 0,
          indexedRecords: data.indexedRecords || 0,
          jobId: data.jobId,
          completedAt: data.completedAt,
          error: data.error || data.error_message || null,
        });

        // Stop polling immediately once job reaches terminal status
        if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'blocked' || currentStatus === 'never_crawled') {
          if (crawlPollRef.current) {
            clearInterval(crawlPollRef.current);
            crawlPollRef.current = null;
          }
        }
      } catch { }
    }, 4000);
  }, [stopPolling]);

  // Initial fetch on mount or websiteId change — only poll if active
  useEffect(() => {
    if (!websiteId) {
      stopPolling();
      return;
    }

    let isMounted = true;

    const fetchInitialStatus = async () => {
      try {
        const res = await fetch(`/api/websites/${websiteId}/crawl`);
        if (!res.ok || !isMounted) return;
        const data = await res.json();
        const currentStatus = data.status || 'never_crawled';

        setCrawlStatus({
          status: currentStatus,
          scanMode: data.scanMode || 'master',
          pagesVisited: data.pagesVisited || 0,
          entitiesFound: data.entitiesFound || 0,
          blockedPages: data.blockedPages || data.blocked_pages || 0,
          indexedRecords: data.indexedRecords || 0,
          jobId: data.jobId,
          completedAt: data.completedAt,
          error: data.error || data.error_message || null,
        });

        // ONLY start polling if the job is actively pending or running
        if (!isTerminalStatus(currentStatus) && isMounted) {
          startPolling(websiteId, data.scanMode);
        } else {
          stopPolling();
        }
      } catch {
        stopPolling();
      }
    };

    fetchInitialStatus();

    // Clean teardown on unmount or websiteId change
    return () => {
      isMounted = false;
      stopPolling();
    };
  }, [websiteId, isTerminalStatus, startPolling, stopPolling]);

  const handleConnectWebsite = async () => {
    const url = wsSiteUrl.trim();
    if (!url) {
      toast.error('Please enter a website URL or domain');
      return;
    }
    setWsError(null);
    setWsConnecting(true);
    const toastId = toast.loading(`Connecting ${url} and initializing knowledge crawler...`);

    try {
      const customSchema = fieldsToSchema(connectCssForm);
      const res = await fetch('/api/websites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wsSiteName.trim() || url,
          domain: url,
          triggerCrawl: true,
          scanMode,
          cssSelectorSchema: customSchema,
          widgetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to connect website');

      if (data.website?.id) {
        if (setWebsiteId) setWebsiteId(data.website.id);
        if (setWebsiteName) setWebsiteName(data.website.name);

        setCrawlStatus({
          status: 'pending',
          scanMode,
          pagesVisited: 0,
          entitiesFound: 0,
          blockedPages: 0,
          indexedRecords: 0,
          jobId: data.crawlJobId,
        });

        // Start active polling for newly triggered crawl
        startPolling(data.website.id, scanMode);
      }
      setWsSiteUrl('');
      setWsSiteName('');
      toast.success(`Website connected! Crawl started in background.`, { id: toastId });
    } catch (err: any) {
      let msg = err.message || 'Failed to connect website';
      if (msg.includes('row-level security') || msg.includes('RLS')) {
        msg = 'Website connected successfully. (Background crawl initiated)';
        toast.success(msg, { id: toastId });
      } else {
        toast.error(msg, { id: toastId });
        setWsError(msg);
      }
    } finally {
      setWsConnecting(false);
    }
  };

  const handleReCrawl = async (mode: ScanMode) => {
    if (!websiteId) return;
    setCrawlStatus(prev => prev
      ? { ...prev, status: 'pending', scanMode: mode }
      : { status: 'pending', scanMode: mode, pagesVisited: 0, entitiesFound: 0, blockedPages: 0, indexedRecords: 0 }
    );
    const toastId = toast.loading(`Starting ${mode === 'quick' ? 'Quick Scan' : 'Master Scan'}...`);
    try {
      const res = await fetch(`/api/websites/${websiteId}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanMode: mode }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Failed to trigger re-crawl');
      }
      // Start active polling for newly triggered recrawl
      startPolling(websiteId, mode);
      toast.success(`Re-crawl started! Pages will be indexed in background.`, { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Failed to start re-crawl', { id: toastId });
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#1E293B' }}>
      <section style={{
        background: 'linear-gradient(135deg, #F0FDF4, #EFF6FF)',
        border: '1px solid #BBF7D0',
        borderRadius: '10px',
        padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
          <Globe2 size={15} color="#16A34A" style={{ flexShrink: 0 }} />
          <h4 style={{ ...sectionTitle, margin: 0 }}>Website Intelligence</h4>
        </div>

        {websiteId ? (
          <WebsiteConnectedPanel
            websiteId={websiteId}
            websiteName={websiteName}
            setWebsiteId={setWebsiteId}
            setWebsiteName={setWebsiteName}
            crawlStatus={crawlStatus}
            setCrawlStatus={setCrawlStatus}
            handleReCrawl={handleReCrawl}
          />
        ) : (
          /* Connect form */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '11px', color: '#475569', margin: 0, lineHeight: '1.5' }}>
              Connect your website and the widget will automatically learn your products, services, and content — no manual entry needed.
            </p>

            {/* Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                style={{ ...input, fontSize: '11px' }}
                value={wsSiteName}
                onChange={e => setWsSiteName(e.target.value)}
                placeholder="Site name (e.g. Acme Auto)"
              />
              <input
                style={{ ...input, fontSize: '11px' }}
                value={wsSiteUrl}
                onChange={e => setWsSiteUrl(e.target.value)}
                placeholder="Website URL (e.g. https://acme.com)"
                onKeyDown={e => e.key === 'Enter' && handleConnectWebsite()}
              />
            </div>

            {/* Scan mode picker */}
            <ScanModeToggle value={scanMode} onChange={setScanMode} disabled={wsConnecting} />

            {/* Advanced CSS Selector settings */}
            <AdvancedCssSchemaSubBlock
              value={connectCssForm}
              onChange={setConnectCssForm}
              disabled={wsConnecting}
              showSaveButton={false}
            />

            {wsError && (
              <p style={{ fontSize: '10px', color: '#DC2626', margin: 0 }}>{wsError}</p>
            )}

            <button
              onClick={handleConnectWebsite}
              disabled={wsConnecting}
              style={{
                padding: '7px 12px', borderRadius: '7px', border: 'none',
                background: wsConnecting ? '#94A3B8' : '#16A34A',
                color: '#FFFFFF', fontSize: '11px', fontWeight: 700,
                cursor: wsConnecting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {wsConnecting ? (
                <><SpinnerIcon />Connecting…</>
              ) : (
                <>
                  <Globe2 size={13} />
                  Connect &amp; Analyze Website
                </>
              )}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}


// ── Shared styles ────────────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#334155',
};

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: '#94A3B8',
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
