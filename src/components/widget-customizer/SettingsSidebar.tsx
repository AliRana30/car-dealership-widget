'use client';
import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Palette,
  Type,
  CircleDot,
  LayoutTemplate,
  Sliders,
  Smartphone,
  Globe2,
  Rocket,
  LayoutGrid,
} from 'lucide-react';
import { CustomizerSection, SECTION_NAV } from './customizerTypes';

interface Props {
  active: CustomizerSection;
  onSelect: (s: CustomizerSection) => void;
}

const SECTION_ICONS: Record<CustomizerSection, React.ReactNode> = {
  branding: <Sparkles size={16} />,
  colors: <Palette size={16} />,
  typography: <Type size={16} />,
  launcher: <CircleDot size={16} />,
  panel: <LayoutTemplate size={16} />,
  behavior: <Sliders size={16} />,
  responsive: <Smartphone size={16} />,
  crawler: <Globe2 size={16} />,
  deploy: <Rocket size={16} />,
};

export default function SettingsSidebar({ active, onSelect }: Props) {
  return (
    <aside style={styles.sidebar} className="customizer-sidebar">
      <div style={styles.sidebarHeader} className="sidebar-header">
        <span style={styles.sidebarTitle}>Sections</span>
      </div>
      <nav style={styles.nav} className="sidebar-nav">
        {SECTION_NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              }}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <span style={{ ...styles.navIcon, ...(isActive ? styles.navIconActive : {}) }}>
                {SECTION_ICONS[item.id]}
              </span>
              <span style={styles.navLabel} className="sidebar-nav-label">{item.label}</span>
              {isActive && <span style={styles.activeBar} className="sidebar-active-bar" />}
            </button>
          );
        })}
      </nav>

      {/* Widget Fleet link */}
      <div style={styles.sidebarFooter} className="sidebar-footer">
        <Link href="/" style={styles.fleetLink}>
          <LayoutGrid size={14} />
          Widget Fleet
        </Link>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '188px',
    minWidth: '188px',
    borderRight: '1px solid #e5e7eb',
    background: '#fafafa',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  sidebarHeader: {
    padding: '16px 16px 10px',
    borderBottom: '1px solid #f0f0f0',
  },
  sidebarTitle: {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#9ca3af',
  },
  nav: {
    padding: '8px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '9px 10px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    position: 'relative',
    transition: 'background 0.15s',
    width: '100%',
  },
  navItemActive: {
    background: '#eff6ff',
  },
  navIcon: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    flexShrink: 0,
  },
  navIconActive: {
    color: '#2563eb',
  },
  navLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
  },
  activeBar: {
    position: 'absolute',
    left: '0',
    top: '6px',
    bottom: '6px',
    width: '3px',
    borderRadius: '0 2px 2px 0',
    background: '#2563eb',
  },
  sidebarFooter: {
    marginTop: 'auto',
    borderTop: '1px solid #f0f0f0',
    padding: '10px 12px',
  },
  fleetLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '8px 10px',
    borderRadius: '8px',
    background: '#EFF6FF',
    border: '1px solid #BFDBFE',
    color: '#1D4ED8',
    fontSize: '11px',
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'background 0.15s',
  },
};
