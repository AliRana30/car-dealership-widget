'use client';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { defaultVoiceWidgetConfig, deepMerge, fromConfigurationRecord, toConfigurationRecord } from '@/config/voiceWidget/default';
import { VoiceWidgetConfig } from '@/config/voiceWidget/types';
import { CustomizerSection } from './customizerTypes';
import SettingsSidebar from './SettingsSidebar';
import PreviewArea from './PreviewArea';
import ColorEditorPanel from './ColorEditorPanel';
import ColorsSection from './ColorsSection';
import DeploySection from './DeploySection';
import CrawlerSection from './CrawlerSection';
import {
  BrandingSection,
  TypographySection,
  LauncherSection,
  PanelSection,
  BehaviorSection,
  ResponsiveSection,
} from './ConfigSections';

// Toggle styles and mobile overrides (injected once)
const TOGGLE_CSS = `
  .cust-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
  .cust-toggle span {
    display: inline-block;
    width: 36px; height: 20px;
    background: #d1d5db;
    border-radius: 999px;
    position: relative;
    transition: background 0.2s;
    cursor: pointer;
  }
  .cust-toggle input:checked + span { background: #2563eb; }
  .cust-toggle span::after {
    content: '';
    position: absolute;
    width: 14px; height: 14px;
    background: white;
    border-radius: 50%;
    top: 3px; left: 3px;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  .cust-toggle input:checked + span::after { transform: translateX(16px); }

  .cust-input:focus { border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.12) !important; outline: none; }
  .cust-select:focus { border-color: #2563eb !important; outline: none; }

  /* iro picker overrides */
  .IroColorPicker { user-select: none; }

  @keyframes drawerSlideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  @keyframes fadeInOverlay {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Responsive Mobile Customizer */
  .mobile-tabs-container {
    display: none;
    border-bottom: 1px solid #e5e7eb;
    background: #ffffff;
  }

  @media (max-width: 900px) {
    .mobile-tabs-container {
      display: flex;
      width: 100%;
      height: 42px;
      flex-shrink: 0;
    }
    .customizer-body {
      flex-direction: row !important;
    }
    
    /* Hide columns based on active tab */
    .tab-editor-active .customizer-preview-col {
      display: none !important;
    }
    .tab-preview-active .customizer-sidebar,
    .tab-preview-active .customizer-editor-col {
      display: none !important;
    }

    .customizer-sidebar {
      height: 100% !important;
      border-right: 1px solid #e2e8f0 !important;
      background: #ffffff !important;
      flex-shrink: 0 !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    .customizer-sidebar::-webkit-scrollbar,
    .customizer-sidebar *::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    .customizer-editor-col {
      width: 100% !important;
      min-width: 0 !important;
      border-right: none !important;
      flex: 1 !important;
      overflow-x: hidden !important;
    }
    .customizer-preview-col {
      flex: 1 !important;
      width: 100% !important;
      height: 100% !important;
      padding: 16px 12px 24px !important;
      box-sizing: border-box !important;
    }
    .customizer-splitter {
      display: none !important;
    }
    .customizer-preview-body {
      padding: 16px 12px !important;
    }
    .customizer-browser-chrome {
      min-height: 480px !important;
    }
    .customizer-color-panel.panel-empty {
      display: none !important;
    }
    .customizer-color-panel.panel-active {
      position: fixed !important;
      right: 0 !important;
      top: 0 !important;
      bottom: 0 !important;
      width: min(340px, 92vw) !important;
      z-index: 1000 !important;
      box-shadow: -8px 0 35px rgba(0,0,0,0.22) !important;
      background: #ffffff !important;
      border-left: 1px solid #e5e7eb !important;
      animation: drawerSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
  }

  @keyframes drawerSlideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  @media (max-width: 640px) {
    .customizer-header {
      padding: 0 10px !important;
      height: 48px !important;
    }
    .customizer-back-link {
      font-size: 12px !important;
      white-space: nowrap !important;
    }
    .customizer-header-title {
      font-size: 12.5px !important;
      white-space: nowrap !important;
    }
    .customizer-header-actions {
      gap: 6px !important;
    }
    .customizer-header-actions button {
      padding: 0 10px !important;
      height: 30px !important;
      font-size: 12px !important;
    }
    .customizer-sidebar {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    .customizer-sidebar::-webkit-scrollbar,
    .customizer-sidebar *::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    .customizer-editor-col {
      padding: 10px 8px 30px !important;
    }
    .mobile-tabs-container {
      height: 38px !important;
    }
  }

  @media (max-width: 480px) {
    .customizer-header {
      padding: 0 8px !important;
      height: 44px !important;
    }
    .customizer-header-divider {
      display: none !important;
    }
    .customizer-header-title {
      display: none !important;
    }
    .customizer-header-actions {
      gap: 4px !important;
    }
    .customizer-header-actions button {
      padding: 0 8px !important;
      height: 28px !important;
      font-size: 11.5px !important;
    }
  }
`;

const SECTION_TITLES: Record<CustomizerSection, string> = {
  branding: 'Branding & Copy',
  colors: 'Colors',
  typography: 'Typography',
  launcher: 'Launcher Button',
  panel: 'Panel & Layout',
  behavior: 'Behavior',
  responsive: 'Responsive',
  crawler: 'Crawler',
  deploy: 'Deploy & Connect',
};

export default function WidgetCustomizerApp() {
  const [draft, setDraft] = useState<VoiceWidgetConfig>(() =>
    deepMerge(defaultVoiceWidgetConfig, {})
  );
  const [activeSection, setActiveSection] = useState<CustomizerSection>('colors');
  const [openColorTokenId, setOpenColorTokenId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const originalRef = useRef<VoiceWidgetConfig>(draft);

  // Width dragger state for editor settings panel
  const [editorWidth, setEditorWidth] = useState<number>(280);
  const [isResizingEditor, setIsResizingEditor] = useState<boolean>(false);
  const editorDragStartRef = useRef<{ startX: number; startWidth: number }>({ startX: 0, startWidth: 280 });

  const handleEditorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingEditor(true);
    editorDragStartRef.current = {
      startX: e.clientX,
      startWidth: editorWidth,
    };
  };

  const handleEditorMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingEditor) return;
    const delta = e.clientX - editorDragStartRef.current.startX;
    const newWidth = Math.min(Math.max(editorDragStartRef.current.startWidth + delta, 220), 560);
    setEditorWidth(newWidth);
  }, [isResizingEditor]);

  const handleEditorMouseUp = useCallback(() => {
    if (isResizingEditor) {
      setIsResizingEditor(false);
    }
  }, [isResizingEditor]);

  useEffect(() => {
    if (isResizingEditor) {
      window.addEventListener('mousemove', handleEditorMouseMove);
      window.addEventListener('mouseup', handleEditorMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleEditorMouseMove);
        window.removeEventListener('mouseup', handleEditorMouseUp);
      };
    }
  }, [isResizingEditor, handleEditorMouseMove, handleEditorMouseUp]);

  // Deploy-specific metadata (not part of visual config)
  const [widgetId, setWidgetId] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const id = p.get('id');
      if (id) return id;
    }
    return 'front-desk';
  });
  const [widgetName, setWidgetName] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const name = p.get('name');
      if (name) return name;
      const id = p.get('id');
      if (id && id !== 'default') {
        return id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
      }
    }
    return 'Front Desk';
  });
  const [retellApiKey, setRetellApiKey] = useState('');
  const [vapiApiKey, setVapiApiKey] = useState('');
  const [isSavedOnServer, setIsSavedOnServer] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [websiteName, setWebsiteName] = useState('Default Website');
  const [widgetStatus, setWidgetStatus] = useState<'active' | 'inactive' | 'paused'>('active');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 860) {
      setIsSidebarCollapsed(true);
    }
  }, []);

  // Fetch on mount (defaults to front-desk if not in query params)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('id') || 'front-desk';

    async function loadWidget() {
      try {
        const fetchFn = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null;
        if (!fetchFn) {
          console.warn('loadWidget: window.fetch is not available.');
          return;
        }

        // 1. Fetch widget metadata/keys
        const resMeta = await fetchFn(`/api/widgets?id=${encodeURIComponent(targetId)}`, {
          cache: 'no-store',
        });
        if (resMeta && resMeta.ok) {
          const metaData = await resMeta.json().catch(() => null);
          if (metaData) {
            if (metaData.id !== undefined && metaData.id !== null) {
              setWidgetId(String(metaData.id));
            }
            if (metaData.name !== undefined && metaData.name !== null) {
              setWidgetName(String(metaData.name));
            }
            setRetellApiKey(metaData.hasRetellApiKey ? '••••••••' : '');
            setVapiApiKey(metaData.hasVapiKey ? '••••••••' : '');
            setAllowedDomains(metaData.allowedDomains || []);
            setWebsiteId(metaData.websiteId || '');
            setWebsiteName(metaData.websiteName || 'Default Website');
            setWidgetStatus(metaData.status || 'active');
          }
        }

        // 2. Fetch exact widget configuration
        const resConfig = await fetchFn(`/api/widgets/${encodeURIComponent(targetId)}/configuration`, {
          cache: 'no-store',
        });
        if (resConfig && resConfig.ok) {
          const configRecord = await resConfig.json().catch(() => null);
          if (configRecord) {
            const voiceConfig = fromConfigurationRecord(configRecord);
            setDraft(voiceConfig);
            originalRef.current = voiceConfig;
          }
        }

        setIsSavedOnServer(true);
      } catch (err) {
        console.error('Failed to load widget config:', err);
        toast.error('Failed to load widget configurations');
      }
    }
    loadWidget();
  }, []);

  const patchDraft = useCallback((patch: Partial<VoiceWidgetConfig>) => {
    setDraft(prev => {
      const next = { ...prev };
      for (const section of Object.keys(patch) as (keyof VoiceWidgetConfig)[]) {
        const patchVal = patch[section];
        if (patchVal && typeof patchVal === 'object' && !Array.isArray(patchVal)) {
          next[section] = {
            ...(prev[section] as any),
            ...patchVal,
          };
        } else if (patchVal !== undefined) {
          (next as any)[section] = patchVal;
        }
      }
      return next;
    });
  }, []);

  const handleColorChange = useCallback((field: string, hex: string) => {
    setDraft(prev => ({
      ...prev,
      theme: { ...prev.theme, [field]: hex },
    }));
  }, []);

  const handleReset = () => {
    setDraft(deepMerge(defaultVoiceWidgetConfig, {}));
    setIsSavedOnServer(false);
    setOpenColorTokenId(null);
    setSaved(false);
    toast.success('Configurations reset to default values.');
  };

  const handleSave = async () => {
    const provider = draft.provider?.provider ?? 'retell';
    const toastId = toast.loading('Saving widget customizer settings...');
    try {
      // 1. Save widget metadata and credentials
      const res = await fetch('/api/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          id: widgetId,
          name: widgetName,
          provider,
          retellApiKey,
          retellAgentId: draft.provider?.provider === 'retell' ? (draft.provider?.agentId || '') : '',
          vapiApiKey,
          vapiAssistantId: draft.provider?.provider === 'vapi' ? (draft.provider?.agentId || '') : '',
          config: draft,
          websiteId,
          allowedDomains,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save widget metadata');
      }

      const data = await res.json();
      const savedWidgetId = data.widget.id;

      // 2. Save the customization configuration record via PUT
      const configRecord = toConfigurationRecord(draft);
      const resConfig = await fetch(`/api/widgets/${encodeURIComponent(savedWidgetId)}/configuration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(configRecord),
      });

      if (!resConfig.ok) {
        const dataConfig = await resConfig.json();
        throw new Error(dataConfig.message || 'Failed to save widget configuration');
      }

      originalRef.current = draft;
      setIsSavedOnServer(true);
      setSaved(true);
      toast.success('Widget customized configuration saved successfully!', { id: toastId });

      if (typeof window !== 'undefined') {
        const nextUrl = `${window.location.pathname}?id=${encodeURIComponent(savedWidgetId)}`;
        window.history.replaceState({ ...window.history.state, as: nextUrl, url: nextUrl }, '', nextUrl);
      }

      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save widget configurations', { id: toastId });
    }
  };

  const handleSectionChange = (s: CustomizerSection) => {
    setActiveSection(s);
    if (s !== 'colors') setOpenColorTokenId(null);
  };

  const handleOpenToken = (id: string) => {
    setOpenColorTokenId(prev => prev === id ? null : id);
  };

  const showColorPanel = openColorTokenId !== null;

  return (
    <div style={styles.root}>
      <style dangerouslySetInnerHTML={{ __html: TOGGLE_CSS }} />

      {/* ── Top Bar ──────────────────────────────────── */}
      <header style={styles.header} className="customizer-header">
        <div style={styles.headerLeft} className="customizer-header-left">
          <Link href="/dashboard" style={styles.backLink} className="customizer-back-link">
            ← Dashboard
          </Link>
          <div style={styles.headerDivider} className="customizer-header-divider" />
          <div style={styles.headerTitle} className="customizer-header-title">Widget Customizer</div>
        </div>
        <div style={styles.headerActions} className="customizer-header-actions">
          <button onClick={handleReset} style={styles.btnSecondary} className="customizer-btn-reset">Reset</button>
          <button onClick={handleSave} style={{
            ...styles.btnPrimary,
            background: saved ? '#16a34a' : '#2563eb',
          }} className="customizer-btn-save">
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div style={styles.mobileTabs} className="mobile-tabs-container">
        <button
          onClick={() => setMobileTab('editor')}
          style={{
            ...styles.mobileTabBtn,
            ...(mobileTab === 'editor' ? styles.mobileTabBtnActive : {}),
          }}
        >
          Customize Settings
        </button>
        <button
          onClick={() => setMobileTab('preview')}
          style={{
            ...styles.mobileTabBtn,
            ...(mobileTab === 'preview' ? styles.mobileTabBtnActive : {}),
          }}
        >
          Live Preview
        </button>
      </div>

      {/* ── Main Layout ──────────────────────────────── */}
      <div style={styles.body} className={`customizer-body ${mobileTab === 'editor' ? 'tab-editor-active' : 'tab-preview-active'}`}>

        {/* LEFT: Section nav */}
        <SettingsSidebar
          active={activeSection}
          onSelect={handleSectionChange}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        />

        {/* CENTER-LEFT: Section editor */}
        <div
          style={{
            ...styles.editorCol,
            width: `${editorWidth}px`,
            minWidth: `${editorWidth}px`,
          }}
          className="customizer-editor-col"
        >
          <div style={styles.editorHeader}>
            <span style={styles.editorTitle}>{SECTION_TITLES[activeSection]}</span>
          </div>
          <div style={styles.editorBody}>
            {activeSection === 'branding' && (
              <BrandingSection draft={draft} onChange={patchDraft} widgetId={widgetId} />
            )}
            {activeSection === 'colors' && (
              <ColorsSection
                draft={draft}
                openTokenId={openColorTokenId}
                onOpenToken={handleOpenToken}
              />
            )}
            {activeSection === 'typography' && (
              <TypographySection draft={draft} onChange={patchDraft} />
            )}
            {activeSection === 'launcher' && (
              <LauncherSection draft={draft} onChange={patchDraft} />
            )}
            {activeSection === 'panel' && (
              <PanelSection draft={draft} onChange={patchDraft} />
            )}
            {activeSection === 'behavior' && (
              <BehaviorSection draft={draft} onChange={patchDraft} />
            )}
            {activeSection === 'responsive' && (
              <ResponsiveSection draft={draft} onChange={patchDraft} />
            )}
            {activeSection === 'crawler' && (
              <CrawlerSection
                websiteId={websiteId}
                setWebsiteId={setWebsiteId}
                websiteName={websiteName}
                setWebsiteName={setWebsiteName}
                widgetId={widgetId}
              />
            )}
            {activeSection === 'deploy' && (
              <DeploySection
                draft={draft}
                onChange={patchDraft}
                widgetId={widgetId}
                setWidgetId={setWidgetId}
                widgetName={widgetName}
                setWidgetName={setWidgetName}
                apiKey={draft.provider?.provider === 'vapi' ? vapiApiKey : retellApiKey}
                setApiKey={draft.provider?.provider === 'vapi' ? setVapiApiKey : setRetellApiKey}
                isSavedOnServer={isSavedOnServer}
                allowedDomains={allowedDomains}
                websiteName={websiteName}
                widgetStatus={widgetStatus}
              />
            )}
          </div>
        </div>

        {/* DRAGGABLE SPLITTER between Editor panel and Preview area */}
        <div
          onMouseDown={handleEditorResizeStart}
          onDoubleClick={() => setEditorWidth(280)}
          style={{
            width: '6px',
            cursor: 'col-resize',
            background: isResizingEditor ? '#2563EB' : '#F1F5F9',
            borderLeft: '1px solid #E5E7EB',
            borderRight: '1px solid #E5E7EB',
            zIndex: 15,
            flexShrink: 0,
            transition: 'background 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
          className="customizer-splitter"
          title="Drag horizontally to resize editor width (Double-click to reset)"
        >
          <div
            style={{
              width: '2px',
              height: '24px',
              borderRadius: '999px',
              background: isResizingEditor ? '#FFFFFF' : '#94A3B8',
            }}
          />
        </div>

        {/* CENTER: Live preview */}
        <div style={styles.previewCol} className="customizer-preview-col">
          <PreviewArea draft={draft} widgetId={widgetId} onUpdateDraft={patchDraft} />
        </div>

        {/* RIGHT: Color editor (ONLY visible on colors section) */}
        {activeSection === 'colors' && (
          <ColorEditorPanel
            draft={draft}
            openTokenId={openColorTokenId}
            onClose={() => setOpenColorTokenId(null)}
            onColorChange={handleColorChange}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    background: '#ffffff',
    fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    overflow: 'hidden',
  },
  header: {
    height: '50px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    background: '#ffffff',
    flexShrink: 0,
    zIndex: 10,
    boxSizing: 'border-box',
    width: '100%',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
    flexShrink: 1,
  },
  backLink: {
    fontSize: '13px',
    color: '#6b7280',
    textDecoration: 'none',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  headerDivider: {
    width: '1px',
    height: '18px',
    background: '#e5e7eb',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#111827',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  btnSecondary: {
    height: '32px',
    padding: '0 14px',
    borderRadius: '7px',
    border: '1px solid #e5e7eb',
    background: '#ffffff',
    color: '#374151',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  },
  btnPrimary: {
    height: '32px',
    padding: '0 14px',
    borderRadius: '7px',
    border: 'none',
    background: '#2563eb',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
    fontFamily: 'inherit',
  },
  mobileTabs: {
    width: '100%',
    height: '44px',
    borderBottom: '1px solid #e5e7eb',
  },
  mobileTabBtn: {
    flex: 1,
    background: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    color: '#64748B',
    outline: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    transition: 'all 0.15s ease',
  },
  mobileTabBtnActive: {
    color: '#2563eb',
    borderBottomColor: '#2563eb',
    background: '#EFF6FF',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  editorCol: {
    width: '256px',
    minWidth: '256px',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    background: '#ffffff',
    flexShrink: 0,
    overflowY: 'hidden',
  },
  editorHeader: {
    padding: '24px 16px 14px',
    borderBottom: '1px solid #f0f0f0',
    background: '#fafafa',
    flexShrink: 0,
  },
  editorTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  editorBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 16px',
  },
  previewCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
};
