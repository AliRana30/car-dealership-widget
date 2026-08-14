'use client';
import React from 'react';
import Link from 'next/link';
import { CustomizerSection, SECTION_NAV } from './customizerTypes';

interface Props {
  active: CustomizerSection;
  onSelect: (s: CustomizerSection) => void;
}

export default function SettingsSidebar({ active, onSelect }: Props) {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <span style={styles.sidebarTitle}>Sections</span>
      </div>
      <nav style={styles.nav}>
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
            >
              <span style={{ ...styles.navIcon, ...(isActive ? styles.navIconActive : {}) }}>
                {item.icon}
              </span>
              <span style={styles.navLabel}>{item.label}</span>
              {isActive && <span style={styles.activeBar} />}
            </button>
          );
        })}
      </nav>

      {/* Widget Fleet link */}
      <div style={styles.sidebarFooter}>
        <Link href="/widgets" style={styles.fleetLink}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="4" y="4" width="6" height="6" rx="1" />
            <rect x="14" y="4" width="6" height="6" rx="1" />
            <rect x="4" y="14" width="6" height="6" rx="1" />
            <rect x="14" y="14" width="6" height="6" rx="1" />
          </svg>
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
    fontSize: '13px',
    color: '#9ca3af',
    flexShrink: 0,
    fontFamily: 'system-ui',
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
