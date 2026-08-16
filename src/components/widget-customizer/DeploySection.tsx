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
  websiteId?: string;
  setWebsiteId?: (val: string) => void;
  websiteName?: string;
  setWebsiteName?: (val: string) => void;
  widgetStatus?: 'active' | 'inactive' | 'paused';
}

const PLATFORMS: Record<string, {
  label: string;
  lang: string;
  code: (origin: string, widgetId: string) => string;
  instructions: string[];
}> = {
  javascript: {
    label: 'JavaScript / HTML',
    lang: 'html',
    code: (origin, widgetId) => `<!-- Voice Agent Widget -->
<script
  src="${origin}/widget.js"
  data-widget-id="${widgetId || 'your-widget-id'}"
  defer
></script>`,
    instructions: [
      'Copy the script snippet above.',
      'Paste it before the closing </body> tag of your website\'s HTML file.',
      'The launcher button will automatically appear in the configured position.'
    ]
  },
  react: {
    label: 'React',
    lang: 'javascript',
    code: (origin, widgetId) => `import { useEffect } from 'react';

export default function VoiceWidget() {
  useEffect(() => {
    // Dynamically insert the widget script into the document body
    const script = document.createElement('script');
    script.src = '${origin}/widget.js';
    script.setAttribute('data-widget-id', '${widgetId || 'your-widget-id'}');
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup script on component unmount
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      const container = document.getElementById('voice-agent-widget-container');
      if (container) container.remove();
    };
  }, []);

  return null;
}`,
    instructions: [
      'Create a new component file named VoiceWidget.jsx/VoiceWidget.tsx.',
      'Paste the React component code above inside it.',
      'Render <VoiceWidget /> inside your main layout (e.g., App.jsx) to load the widget globally.'
    ]
  },
  nextjs: {
    label: 'Next.js',
    lang: 'javascript',
    code: (origin, widgetId) => `import Script from 'next/script';

export default function VoiceWidget() {
  return (
    <Script
      src="${origin}/widget.js"
      data-widget-id="${widgetId || 'your-widget-id'}"
      strategy="lazyOnload"
    />
  );
}`,
    instructions: [
      'Create a file components/VoiceWidget.tsx and paste the code above.',
      'Import and include <VoiceWidget /> inside your root layout file (app/layout.tsx for App Router or pages/_app.tsx for Pages Router).',
      'The widget uses Next.js Script optimization for fast, non-blocking loading.'
    ]
  },
  vue: {
    label: 'Vue',
    lang: 'javascript',
    code: (origin, widgetId) => `<template>
  <!-- Voice Widget Loader -->
  <div v-if="false"></div>
</template>

<script>
export default {
  name: 'VoiceWidget',
  mounted() {
    this.script = document.createElement('script');
    this.script.src = '${origin}/widget.js';
    this.script.setAttribute('data-widget-id', '${widgetId || 'your-widget-id'}');
    this.script.defer = true;
    document.body.appendChild(this.script);
  },
  beforeUnmount() {
    if (this.script && document.body.contains(this.script)) {
      document.body.removeChild(this.script);
    }
    const container = document.getElementById('voice-agent-widget-container');
    if (container) container.remove();
  }
}
</script>`,
    instructions: [
      'Create a file VoiceWidget.vue and paste the template-script code above.',
      'Register and render the component inside your main layout component (e.g., App.vue).',
      'The component handles lifecycle mounting and automatic unmounting.'
    ]
  },
  angular: {
    label: 'Angular',
    lang: 'javascript',
    code: (origin, widgetId) => `import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-voice-widget',
  template: ''
})
export class VoiceWidgetComponent implements OnInit, OnDestroy {
  private script: HTMLScriptElement | null = null;

  ngOnInit() {
    this.script = document.createElement('script');
    this.script.src = '${origin}/widget.js';
    this.script.setAttribute('data-widget-id', '${widgetId || 'your-widget-id'}');
    this.script.defer = true;
    document.body.appendChild(this.script);
  }

  ngOnDestroy() {
    if (this.script && document.body.contains(this.script)) {
      document.body.removeChild(this.script);
    }
    const container = document.getElementById('voice-agent-widget-container');
    if (container) container.remove();
  }
}`,
    instructions: [
      'Generate a component using Angular CLI: ng g component voice-widget.',
      'Paste the component class code above into the voice-widget.component.ts file.',
      'Include <app-voice-widget></app-voice-widget> inside your root template (app.component.html).'
    ]
  },
  wordpress: {
    label: 'WordPress',
    lang: 'wordpress',
    code: (origin, widgetId) => `<?php
/*
Plugin Name: Front Desk Voice Widget
Description: Embedded Voice Widget client integrations.
Version: 1.0
Author: Front Desk
*/

function enqueue_voice_widget() {
    wp_enqueue_script(
        'front-desk-voice-widget',
        '${origin}/widget.js',
        array(),
        '1.0',
        true
    );
    wp_script_add_data('front-desk-voice-widget', 'data-widget-id', '${widgetId || 'your-widget-id'}');
}
add_action('wp_enqueue_scripts', 'enqueue_voice_widget');`,
    instructions: [
      'Create a new directory named /wp-content/plugins/front-desk-widget/ inside your WordPress directory.',
      'Create a file named front-desk-widget.php inside that directory, and paste the code above.',
      'Go to the WordPress Admin Panel → Plugins page and activate "Front Desk Voice Widget".'
    ]
  },
  php: {
    label: 'PHP',
    lang: 'php',
    code: (origin, widgetId) => `<?php
// Paste this inside your PHP template (e.g. footer.php or index.php)
?>
<!-- Voice Agent Widget -->
<script
  src="<?php echo '${origin}/widget.js'; ?>"
  data-widget-id="<?php echo '${widgetId || 'your-widget-id'}'; ?>"
  defer
></script>`,
    instructions: [
      'Paste the script tag snippet inside your PHP layout template (e.g., footer.php).',
      'Ensure it is inserted just before the closing </body> tag.',
      'This will automatically load the script onto all server-generated PHP pages.'
    ]
  },
  iframe: {
    label: 'iframe',
    lang: 'html',
    code: (origin, widgetId) => `<iframe
  src="${origin}/embed/${widgetId || 'your-widget-id'}"
  width="100%"
  height="600px"
  style="border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
  allow="microphone"
></iframe>`,
    instructions: [
      'Paste the <iframe> tag code into your page template or WYSIWYG editor.',
      'Important: The allow="microphone" attribute is required so the iframe can request microphone access for voice calls.',
      'This displays the full interface inline in the page layout instead of a launcher button.'
    ]
  }
};

function highlightCode(code: string, lang: string) {
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (lang === 'html' || lang === 'iframe') {
    html = html.replace(/(&lt;\/?[a-zA-Z0-9-]+)(&gt;|\s)/g, '<span style="color:#F43F5E">$1</span>$2');
    html = html.replace(/(&lt;\/?[a-zA-Z0-9-]+$)/g, '<span style="color:#F43F5E">$1</span>');
    html = html.replace(/(\s[a-zA-Z0-9-]+)=/g, '<span style="color:#F59E0B">$1</span>=');
    html = html.replace(/(["'].*?["'])/g, '<span style="color:#10B981">$1</span>');
    html = html.replace(/(&lt;!--.*?--&gt;)/g, '<span style="color:#64748B;font-style:italic">$1</span>');
  } else if (lang === 'javascript' || lang === 'react' || lang === 'nextjs' || lang === 'vue' || lang === 'angular') {
    const keywords = /\b(import|export|default|function|const|let|var|return|null|true|false|if|else|new|class|private|extends|strategy)\b/g;
    html = html.replace(keywords, '<span style="color:#F43F5E">$1</span>');
    const apis = /\b(document|body|appendChild|removeChild|createElement|setAttribute|remove|getElementById|console|window)\b/g;
    html = html.replace(apis, '<span style="color:#6366F1">$1</span>');
    html = html.replace(/(&lt;\/?[a-zA-Z0-9-]+)(&gt;|\s)/g, '<span style="color:#0EA5E9">$1</span>$2');
    html = html.replace(/(["'`].*?["'`])/g, '<span style="color:#10B981">$1</span>');
    html = html.replace(/(\/\/.*)/g, '<span style="color:#64748B;font-style:italic">$1</span>');
  } else if (lang === 'wordpress' || lang === 'php') {
    const phpKeywords = /\b(function|array|true|false|add_action|wp_enqueue_script|wp_script_add_data)\b/g;
    html = html.replace(phpKeywords, '<span style="color:#F43F5E">$1</span>');
    html = html.replace(/(&lt;\?php|\?&gt;)/g, '<span style="color:#EF4444;font-weight:bold">$1</span>');
    html = html.replace(/(["'].*?["'])/g, '<span style="color:#10B981">$1</span>');
    html = html.replace(/(\/\/.*|\/\*[\s\S]*?\*\/|#.*)/g, '<span style="color:#64748B;font-style:italic">$1</span>');
  }

  return <code dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── WebsiteConnectedPanel ──────────────────────────────────────────────────────
interface WebsiteConnectedPanelProps {
  websiteId: string;
  websiteName?: string;
  setWebsiteId?: (val: string) => void;
  setWebsiteName?: (val: string) => void;
  crawlStatus: {
    status: string;
    pagesVisited: number;
    entitiesFound: number;
    indexedRecords: number;
    jobId?: string;
    completedAt?: string;
  } | null;
  setCrawlStatus: React.Dispatch<React.SetStateAction<{
    status: string;
    pagesVisited: number;
    entitiesFound: number;
    indexedRecords: number;
    jobId?: string;
    completedAt?: string;
  } | null>>;
  handleReCrawl: () => void;
  crawlPollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
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
  const [editingName, setEditingName] = React.useState(false);
  const [editName, setEditName] = React.useState(websiteName || '');
  const [savingName, setSavingName] = React.useState(false);

  const handleSaveName = async () => {
    if (!editName.trim() || editName.trim() === websiteName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        if (setWebsiteName) setWebsiteName(editName.trim());
      }
    } catch {}
    setSavingName(false);
    setEditingName(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Site name row with inline edit */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
        <span style={{ color: '#64748B', fontWeight: 500, flexShrink: 0 }}>Connected Site</span>
        {editingName ? (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
              style={{
                fontSize: '11px', padding: '3px 7px', borderRadius: '5px',
                border: '1px solid #93C5FD', outline: 'none',
                width: '120px', color: '#0F172A',
              }}
            />
            <button
              onClick={handleSaveName}
              disabled={savingName}
              style={{ padding: '3px 7px', borderRadius: '5px', border: 'none', background: '#2563EB', color: '#fff', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
            >
              {savingName ? '…' : 'Save'}
            </button>
            <button
              onClick={() => setEditingName(false)}
              style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: '10px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ color: '#0F172A', fontWeight: 700, maxWidth: '120px', textAlign: 'right', wordBreak: 'break-all' }}>{websiteName}</span>
            <button
              onClick={() => { setEditName(websiteName || ''); setEditingName(true); }}
              title="Edit website name"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
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
          {crawlStatus.status === 'running' || crawlStatus.status === 'pending' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(37,99,235,0.06)', borderRadius: '7px', padding: '7px 10px' }}>
              <SpinnerIcon />
              <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 500 }}>Analyzing your website…</span>
            </div>
          ) : crawlStatus.status === 'completed' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#64748B' }}>Pages analyzed</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{crawlStatus.pagesVisited}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#64748B' }}>Knowledge records</span>
                <span style={{ fontWeight: 700, color: '#16A34A' }}>{crawlStatus.indexedRecords || crawlStatus.entitiesFound}</span>
              </div>
            </div>
          ) : crawlStatus.status === 'failed' ? (
            <div style={{ fontSize: '11px', color: '#B91C1C', background: '#FEF2F2', borderRadius: '6px', padding: '7px 10px' }}>
              Crawl failed — try re-crawling below.
            </div>
          ) : null}
        </>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          onClick={handleReCrawl}
          disabled={crawlStatus?.status === 'running' || crawlStatus?.status === 'pending'}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: '7px', border: '1px solid #BBF7D0',
            background: '#FFFFFF', color: '#15803D', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            opacity: (crawlStatus?.status === 'running' || crawlStatus?.status === 'pending') ? 0.5 : 1,
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.73-.73" />
          </svg>
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View Data
        </button>

        <button
          onClick={() => {
            if (setWebsiteId) setWebsiteId('');
            if (setWebsiteName) setWebsiteName('');
            setCrawlStatus(null);
          }}
          style={{
            padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0',
            background: '#FFFFFF', color: '#64748B', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Disconnect website"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
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
  websiteId = '',
  setWebsiteId,
  websiteName = 'Default Website',
  setWebsiteName,
  widgetStatus = 'active',
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

  // ── Website Intelligence state ──────────────────────────────────────────────
  const [wsSiteUrl, setWsSiteUrl] = useState('');
  const [wsSiteName, setWsSiteName] = useState('');
  const [wsConnecting, setWsConnecting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [crawlStatus, setCrawlStatus] = useState<{
    status: string;
    pagesVisited: number;
    entitiesFound: number;
    indexedRecords: number;
    jobId?: string;
    completedAt?: string;
  } | null>(null);
  const crawlPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll crawl job status when websiteId is present
  useEffect(() => {
    if (!websiteId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/websites/${websiteId}/crawl`);
        if (!res.ok) return;
        const data = await res.json();
        setCrawlStatus({
          status: data.status || 'never_crawled',
          pagesVisited: data.pagesVisited || 0,
          entitiesFound: data.entitiesFound || 0,
          indexedRecords: data.indexedRecords || 0,
          jobId: data.jobId,
          completedAt: data.completedAt,
        });
        // Stop polling when done
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'never_crawled') {
          if (crawlPollRef.current) clearInterval(crawlPollRef.current);
        }
      } catch {}
    };
    poll();
    crawlPollRef.current = setInterval(poll, 4000);
    return () => { if (crawlPollRef.current) clearInterval(crawlPollRef.current); };
  }, [websiteId]);

  const handleConnectWebsite = async () => {
    const url = wsSiteUrl.trim();
    if (!url) { setWsError('Please enter a website URL or domain'); return; }
    setWsError(null);
    setWsConnecting(true);
    try {
      const res = await fetch('/api/websites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wsSiteName.trim() || url,
          domain: url,
          triggerCrawl: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to connect website');
      // Start polling the new job
      if (data.website?.id) {
        if (setWebsiteId) setWebsiteId(data.website.id);
        if (setWebsiteName) setWebsiteName(data.website.name);
        
        setCrawlStatus({ status: 'pending', pagesVisited: 0, entitiesFound: 0, indexedRecords: 0, jobId: data.crawlJobId });
        // Reload crawl status from new website
        if (crawlPollRef.current) clearInterval(crawlPollRef.current);
        crawlPollRef.current = setInterval(async () => {
          try {
            const r = await fetch(`/api/websites/${data.website.id}/crawl`);
            if (!r.ok) return;
            const d = await r.json();
            setCrawlStatus({ status: d.status || 'pending', pagesVisited: d.pagesVisited || 0, entitiesFound: d.entitiesFound || 0, indexedRecords: d.indexedRecords || 0, jobId: d.jobId, completedAt: d.completedAt });
            if (d.status === 'completed' || d.status === 'failed') { if (crawlPollRef.current) clearInterval(crawlPollRef.current); }
          } catch {}
        }, 4000);
      }
      setWsSiteUrl('');
      setWsSiteName('');
    } catch (err: any) {
      setWsError(err.message || 'Failed to connect website');
    } finally {
      setWsConnecting(false);
    }
  };

  const handleReCrawl = async () => {
    if (!websiteId) return;
    setCrawlStatus(prev => prev ? { ...prev, status: 'pending' } : { status: 'pending', pagesVisited: 0, entitiesFound: 0, indexedRecords: 0 });
    try {
      await fetch(`/api/websites/${websiteId}/crawl`, { method: 'POST' });
      if (crawlPollRef.current) clearInterval(crawlPollRef.current);
      crawlPollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/websites/${websiteId}/crawl`);
          if (!r.ok) return;
          const d = await r.json();
          setCrawlStatus({ status: d.status || 'pending', pagesVisited: d.pagesVisited || 0, entitiesFound: d.entitiesFound || 0, indexedRecords: d.indexedRecords || 0, jobId: d.jobId, completedAt: d.completedAt });
          if (d.status === 'completed' || d.status === 'failed') { if (crawlPollRef.current) clearInterval(crawlPollRef.current); }
        } catch {}
      }, 4000);
    } catch {}
  };

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

  // Persisted Platform selector
  const selectedPlatform = draft.behavior?.installationType || 'javascript';
  const platform = PLATFORMS[selectedPlatform] || PLATFORMS.javascript;
  const embedCode = platform.code(origin, widgetId);

  const handlePlatformChange = (val: string) => {
    onChange({
      behavior: {
        ...draft.behavior,
        installationType: val,
      }
    } as any);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

      {/* ── Website Intelligence ─────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(135deg, #F0FDF4, #EFF6FF)',
        border: '1px solid #BBF7D0',
        borderRadius: '10px',
        padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
          <h4 style={{ ...sectionTitle, margin: 0 }}>Website Intelligence</h4>
        </div>

        {/* Connected state */}
        {websiteId ? (
          <WebsiteConnectedPanel
            websiteId={websiteId}
            websiteName={websiteName}
            setWebsiteId={setWebsiteId}
            setWebsiteName={setWebsiteName}
            crawlStatus={crawlStatus}
            setCrawlStatus={setCrawlStatus}
            handleReCrawl={handleReCrawl}
            crawlPollRef={crawlPollRef}
          />

        ) : (
          /* Connect form */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ fontSize: '11px', color: '#475569', margin: 0, lineHeight: '1.5' }}>
              Connect your website and the widget will automatically learn your products, services, and content — no manual entry needed.
            </p>
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
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  Connect & Analyze Website
                </>
              )}
            </button>
          </div>
        )}
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

      {/* ── Platform Specific Code Generator ─────────────────── */}
      <section>
        <h4 style={sectionTitle}>Installation Code Generator</h4>

        <Field label="Installation Platform / Script Language">
          <select
            style={select}
            value={selectedPlatform}
            onChange={(e) => handlePlatformChange(e.target.value)}
          >
            {Object.keys(PLATFORMS).map((key) => (
              <option key={key} value={key}>
                {PLATFORMS[key].label}
              </option>
            ))}
          </select>
        </Field>

        {/* OS style Code Box */}
        <div style={{
          background: '#0F172A',
          borderRadius: '10px',
          overflow: 'hidden',
          border: '1px solid #334155',
          marginTop: '12px',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: '#1E293B',
            borderBottom: '1px solid #334155',
          }}>
            <div style={{ display: 'flex', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
            </div>
            <span style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              color: '#94A3B8',
              fontWeight: 500
            }}>
              {platform.label} Snippet
            </span>
          </div>

          {/* Editor Container */}
          <div style={{ position: 'relative', padding: '14px' }}>
            <pre style={codeStyle}>
              {highlightCode(embedCode, platform.lang)}
            </pre>
          </div>
        </div>

        {/* Copy & Status Bar */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={handleCopy}
            disabled={!widgetId}
            style={{
              ...copyBtn,
              background: copied ? '#10B981' : '#2563EB',
              flex: 1,
              padding: '8px 12px',
              textAlign: 'center',
              boxShadow: '0 2px 4px rgba(37,99,235,0.15)',
            }}
          >
            {copied ? 'Copied ✓' : 'Copy Integration Code'}
          </button>
        </div>

        {/* Instructions */}
        <div style={{
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '12px',
          marginTop: '12px',
        }}>
          <h5 style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#475569',
            margin: '0 0 8px',
          }}>
            Installation Instructions:
          </h5>
          <ol style={{
            margin: 0,
            paddingLeft: '18px',
            fontSize: '11px',
            color: '#475569',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            lineHeight: '1.4',
          }}>
            {platform.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
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

// ── Website Intelligence helpers ──────────────────────────────────────────────

function CrawlStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending:       { bg: '#FEF3C7', color: '#D97706', label: 'Queued' },
    running:       { bg: '#DBEAFE', color: '#2563EB', label: 'Crawling…' },
    completed:     { bg: '#DCFCE7', color: '#15803D', label: 'Complete' },
    failed:        { bg: '#FEE2E2', color: '#B91C1C', label: 'Failed' },
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

