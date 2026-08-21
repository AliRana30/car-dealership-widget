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
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { CustomizerSection, SECTION_NAV } from './customizerTypes';

interface Props {
  active: CustomizerSection;
  onSelect: (s: CustomizerSection) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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

export default function SettingsSidebar({
  active,
  onSelect,
  isCollapsed = false,
  onToggleCollapse,
}: Props) {
  return (
    <aside
      style={{
        ...styles.sidebar,
        width: isCollapsed ? '58px' : '192px',
        minWidth: isCollapsed ? '58px' : '192px',
      }}
      className={`customizer-sidebar ${isCollapsed ? 'is-collapsed' : ''}`}
    >
      {/* Sidebar Header with Expand / Collapse Button */}
      <div
        style={{
          ...styles.sidebarHeader,
          justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: isCollapsed ? '12px 6px' : '12px 14px 10px',
        }}
        className="sidebar-header"
      >
        {!isCollapsed && (
          <span style={styles.sidebarTitle}>Sections</span>
        )}

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            style={styles.collapseBtn}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      {/* Nav List */}
      <nav
        style={{
          ...styles.nav,
          padding: isCollapsed ? '8px 6px' : '8px 8px',
          alignItems: isCollapsed ? 'center' : 'stretch',
        }}
        className="sidebar-nav"
      >
        {SECTION_NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={item.label}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                padding: isCollapsed ? '9px 0' : '9px 10px',
              }}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <span style={{ ...styles.navIcon, ...(isActive ? styles.navIconActive : {}) }}>
                {SECTION_ICONS[item.id]}
              </span>

              {!isCollapsed && (
                <span style={styles.navLabel} className="sidebar-nav-label">{item.label}</span>
              )}

              {isActive && (
                <span
                  style={isCollapsed ? styles.activeDot : styles.activeBar}
                  className="sidebar-active-bar"
                />
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    borderRight: '1px solid #e5e7eb',
    background: '#fafafa',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    zIndex: 10,
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #f0f0f0',
  },
  sidebarTitle: {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#9ca3af',
  },
  collapseBtn: {
    background: 'none',
    border: 'none',
    color: '#64748B',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s, background 0.15s',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
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
    whiteSpace: 'nowrap',
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
  activeDot: {
    position: 'absolute',
    right: '4px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#2563eb',
  },
  sidebarFooter: {
    marginTop: 'auto',
    borderTop: '1px solid #f0f0f0',
    display: 'flex',
  },
  fleetLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    borderRadius: '8px',
    background: '#EFF6FF',
    border: '1px solid #BFDBFE',
    color: '#1D4ED8',
    fontSize: '11px',
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'background 0.15s',
    width: '100%',
  },
};
