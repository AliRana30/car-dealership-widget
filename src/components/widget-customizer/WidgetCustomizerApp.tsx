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
      height: 44px;
      flex-shrink: 0;
    }
    .customizer-body {
      flex-direction: column !important;
    }
    
    /* Hide columns based on active tab */
    .tab-editor-active .customizer-preview-col {
      display: none !important;
    }
    .tab-preview-active .customizer-sidebar,
    .tab-preview-active .customizer-editor-col {
      display: none !important;
    }

    /* Horizontal sidebar on mobile */
    .customizer-sidebar {
      width: 100% !important;
      min-width: 100% !important;
      height: auto !important;
      flex-direction: row !important;
      border-right: none !important;
      border-bottom: 1px solid #e5e7eb !important;
      background: #fafafa !important;
    }
    .sidebar-header, .sidebar-footer {
      display: none !important;
    }
    .sidebar-nav {
      flex-direction: row !important;
      padding: 6px 12px !important;
      overflow-x: auto !important;
      width: 100% !important;
      flex-wrap: nowrap !important;
      -webkit-overflow-scrolling: touch;
      gap: 8px !important;
    }
    .sidebar-nav-item {
      width: auto !important;
      flex-shrink: 0 !important;
      white-space: nowrap !important;
      padding: 6px 12px !important;
      border-radius: 8px !important;
    }
    .sidebar-nav-label {
      font-size: 12px !important;
    }
    .sidebar-active-bar {
      bottom: 0 !important;
      left: 6px !important;
      right: 6px !important;
      height: 3px !important;
      width: auto !important;
      top: auto !important;
      border-radius: 2px 2px 0 0 !important;
    }
    .customizer-editor-col {
      width: 100% !important;
      min-width: 100% !important;
      border-right: none !important;
      flex: 1 !important;
    }
    .customizer-preview-col {
      flex: 1 !important;
      width: 100% !important;
      height: 100% !important;
    }
    .customizer-header-actions button {
      padding: 0 10px !important;
      font-size: 12px !important;
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

  // Deploy-specific metadata (not part of visual config)
  const [widgetId, setWidgetId] = useState('default');
  const [widgetName, setWidgetName] = useState('Default Widget');
  const [retellApiKey, setRetellApiKey] = useState('');
  const [vapiApiKey, setVapiApiKey] = useState('');
  const [isSavedOnServer, setIsSavedOnServer] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [websiteName, setWebsiteName] = useState('Default Website');
  const [widgetStatus, setWidgetStatus] = useState<'active' | 'inactive' | 'paused'>('active');

  // Fetch on mount if id is in query params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (!idParam) return;

    async function loadWidget() {
      try {
        if (!idParam) return;
        const fetchFn = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null;
        if (!fetchFn) {
          console.warn('loadWidget: window.fetch is not available.');
          return;
        }

        // 1. Fetch widget metadata/keys
        const resMeta = await fetchFn(`/api/widgets?id=${encodeURIComponent(idParam)}`);
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
        const resConfig = await fetchFn(`/api/widgets/${encodeURIComponent(idParam)}/configuration`);
        if (resConfig && resConfig.ok) {
          const configRecord = await resConfig.json().catch(() => null);
          if (configRecord) {
            const voiceConfig = fromConfigurationRecord(configRecord);
            setDraft(deepMerge(defaultVoiceWidgetConfig, voiceConfig));
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
    setDraft(prev => deepMerge(prev, patch as any));
  }, []);

  const handleColorChange = useCallback((field: string, hex: string) => {
    setDraft(prev => ({
      ...prev,
      theme: { ...prev.theme, [field]: hex },
    }));
  }, []);

  const handleReset = () => {
    setDraft(deepMerge(defaultVoiceWidgetConfig, {}));
    setWidgetId('default');
    setWidgetName('Default Widget');
    setRetellApiKey('');
    setVapiApiKey('');
    setIsSavedOnServer(false);
    setAllowedDomains([]);
    setWebsiteId('');
    setWebsiteName('Default Website');
    setWidgetStatus('active');
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
        body: JSON.stringify(configRecord),
      });

      if (!resConfig.ok) {
        const dataConfig = await resConfig.json();
        throw new Error(dataConfig.message || 'Failed to save widget configuration');
      }

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
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <Link href="/" style={styles.backLink}>
            ← Back
          </Link>
          <div style={styles.headerDivider} />
          <div style={styles.headerTitle}>Widget Customizer</div>
        </div>
        <div style={styles.headerActions} className="customizer-header-actions">
          <button onClick={handleReset} style={styles.btnSecondary}>Reset</button>
          <button onClick={handleSave} style={{
            ...styles.btnPrimary,
            background: saved ? '#16a34a' : '#2563eb',
          }}>
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
        <SettingsSidebar active={activeSection} onSelect={handleSectionChange} />

        {/* CENTER-LEFT: Section editor */}
        <div style={styles.editorCol} className="customizer-editor-col">
          <div style={styles.editorHeader}>
            <span style={styles.editorTitle}>{SECTION_TITLES[activeSection]}</span>
          </div>
          <div style={styles.editorBody}>
            {activeSection === 'branding' && (
              <BrandingSection draft={draft} onChange={patchDraft} />
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
                websiteId={websiteId}
                setWebsiteId={setWebsiteId}
                websiteName={websiteName}
                setWebsiteName={setWebsiteName}
                widgetStatus={widgetStatus}
              />
            )}
          </div>
        </div>

        {/* CENTER: Live preview */}
        <div style={styles.previewCol} className="customizer-preview-col">
          <PreviewArea draft={draft} widgetId={widgetId} />
        </div>

        {/* RIGHT: Color editor (conditional) */}
        <ColorEditorPanel
          draft={draft}
          openTokenId={openColorTokenId}
          onClose={() => setOpenColorTokenId(null)}
          onColorChange={handleColorChange}
        />
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
    fontFamily: "'Inter', 'Figtree', system-ui, sans-serif",
    overflow: 'hidden',
  },
  header: {
    height: '52px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    background: '#ffffff',
    flexShrink: 0,
    zIndex: 10,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  backLink: {
    fontSize: '13px',
    color: '#6b7280',
    textDecoration: 'none',
    fontWeight: 500,
  },
  headerDivider: {
    width: '1px',
    height: '18px',
    background: '#e5e7eb',
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#111827',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
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
    display: 'flex',
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
    borderBottom: '2px solid transparent',
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
    padding: '14px 16px 10px',
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
    padding: '16px',
  },
  previewCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
};
