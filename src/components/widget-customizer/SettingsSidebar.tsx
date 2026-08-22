'use client';
import React, { useState, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Layers,
  Moon,
  Sun,
  Home,
  Users,
  ShoppingBag,
  Briefcase,
  AlertTriangle,
  Bell,
} from 'lucide-react';
import { CustomizerSection, SECTION_NAV } from './customizerTypes';

interface Props {
  active: CustomizerSection;
  onSelect: (s: CustomizerSection) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const SECTION_ICONS: Record<CustomizerSection, React.ReactNode> = {
  branding: <Home size={18} strokeWidth={2} />,
  colors: <Palette size={18} strokeWidth={2} />,
  typography: <Type size={18} strokeWidth={2} />,
  launcher: <CircleDot size={18} strokeWidth={2} />,
  panel: <LayoutTemplate size={18} strokeWidth={2} />,
  behavior: <Sliders size={18} strokeWidth={2} />,
  responsive: <Smartphone size={18} strokeWidth={2} />,
  crawler: <Globe2 size={18} strokeWidth={2} />,
  deploy: <Rocket size={18} strokeWidth={2} />,
};

export default function SettingsSidebar({
  active,
  onSelect,
  isCollapsed = false,
  onToggleCollapse,
}: Props) {
  const [isDark, setIsDark] = useState(false);
  const [user, setUser] = useState<{ name: string; role: string; avatar?: string }>({
    name: 'Ali Mahmood Rana',
    role: 'admin',
    avatar: 'https://lh3.googleusercontent.com/a/ACg8ocLglB3D4Kcc5eVz_h0dxZLqZanOJ4JOJAZ3nAiMIjMYYfpnDg=s96-c',
  });

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.user) {
          setUser({
            name: data.user.name || data.user.email?.split('@')[0] || 'Ali Mahmood Rana',
            role: data.user.role || 'admin',
            avatar: data.user.avatar || 'https://lh3.googleusercontent.com/a/ACg8ocLglB3D4Kcc5eVz_h0dxZLqZanOJ4JOJAZ3nAiMIjMYYfpnDg=s96-c',
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <aside
      style={{
        ...styles.sidebar,
        width: isCollapsed ? '68px' : '210px',
        minWidth: isCollapsed ? '68px' : '210px',
      }}
      className={`customizer-sidebar ${isCollapsed ? 'is-collapsed' : ''}`}
    >
      {/* Floating Top-Right Expand/Collapse Toggle Button */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          style={styles.floatingToggleBtn}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight size={13} strokeWidth={2.5} color="#475569" />
          ) : (
            <ChevronLeft size={13} strokeWidth={2.5} color="#475569" />
          )}
        </button>
      )}

      {/* Top Branding Section */}
      <div
        style={{
          ...styles.brandContainer,
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          padding: isCollapsed ? '16px 8px 12px' : '16px 14px 12px',
        }}
      >
        <div style={styles.logoBadge}>
          <Layers size={18} strokeWidth={2.5} color="#FFFFFF" />
        </div>

        {!isCollapsed && (
          <div style={styles.brandTextWrapper}>
            <span style={styles.brandTitle}>Front Desk</span>
            <span style={styles.brandSubtitle}>ADMIN PANEL</span>
          </div>
        )}
      </div>

      {/* Category Header */}
      {!isCollapsed && (
        <div style={styles.sectionHeader}>
          <span>MAIN</span>
        </div>
      )}

      {/* Navigation List (Scrollbar completely hidden) */}
      <nav
        style={{
          ...styles.nav,
          padding: isCollapsed ? '8px 8px' : '6px 10px',
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
                padding: isCollapsed ? '10px 0' : '9px 12px',
              }}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              {/* Icon */}
              <span
                style={{
                  ...styles.navIcon,
                  ...(isActive ? styles.navIconActive : {}),
                }}
              >
                {SECTION_ICONS[item.id]}
              </span>

              {/* Label */}
              {!isCollapsed && (
                <span
                  style={{
                    ...styles.navLabel,
                    ...(isActive ? styles.navLabelActive : {}),
                  }}
                  className="sidebar-nav-label"
                >
                  {item.label}
                </span>
              )}

              {/* Active Indicator: Dot on right (expanded) or curved outline */}
              {isActive && !isCollapsed && (
                <span style={styles.activeOrangeDot} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Footer Section */}
      <div
        style={{
          ...styles.footerContainer,
          padding: isCollapsed ? '12px 6px' : '12px 10px',
          alignItems: isCollapsed ? 'center' : 'stretch',
        }}
      >
        {/* Dark Mode Toggle Button */}
        <button
          onClick={() => setIsDark(!isDark)}
          style={{
            ...styles.darkModeBtn,
            justifyContent: isCollapsed ? 'center' : 'center',
            padding: isCollapsed ? '8px 0' : '8px 12px',
          }}
          title="Toggle Dark Mode"
        >
          {isDark ? (
            <Sun size={15} color="#F59E0B" strokeWidth={2} />
          ) : (
            <Moon size={15} color="#475569" strokeWidth={2} />
          )}
          {!isCollapsed && (
            <span style={styles.darkModeText}>
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </span>
          )}
        </button>

        {/* User Profile Card */}
        <div
          style={{
            ...styles.userProfileCard,
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: isCollapsed ? '8px 0 0' : '10px 6px 4px',
          }}
        >
          <img
            src={user.avatar || 'https://lh3.googleusercontent.com/a/ACg8ocLglB3D4Kcc5eVz_h0dxZLqZanOJ4JOJAZ3nAiMIjMYYfpnDg=s96-c'}
            alt={user.name}
            style={styles.userAvatar}
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=Ali+Rana&background=EA580C&color=fff';
            }}
          />

          {!isCollapsed && (
            <div style={styles.userInfoWrapper}>
              <span style={styles.userName} title={user.name}>{user.name}</span>
              <span style={styles.userRole}>{user.role}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    borderRight: '1px solid #E2E8F0',
    background: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    transition: 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'relative',
    zIndex: 20,
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  floatingToggleBtn: {
    position: 'absolute',
    right: '-11px',
    top: '20px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: '#FFFFFF',
    border: '1px solid #CBD5E1',
    boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 35,
    padding: 0,
    transition: 'transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
  },
  brandContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderBottom: '1px solid #F1F5F9',
    flexShrink: 0,
  },
  logoBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 8px rgba(234, 88, 12, 0.28)',
    flexShrink: 0,
  },
  brandTextWrapper: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    lineHeight: 1.2,
  },
  brandTitle: {
    fontSize: '14.5px',
    fontWeight: 700,
    color: '#0F172A',
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
  },
  brandSubtitle: {
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#94A3B8',
    whiteSpace: 'nowrap',
    marginTop: '1px',
  },
  sectionHeader: {
    padding: '12px 14px 4px',
    fontSize: '10.5px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#94A3B8',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: '1 1 auto',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '11px',
    borderRadius: '10px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    position: 'relative',
    transition: 'background-color 0.15s ease, color 0.15s ease',
    width: '100%',
    boxSizing: 'border-box',
  },
  navItemActive: {
    background: '#FFF7ED',
    boxShadow: 'inset 3.5px 0 0 0 #EA580C',
    borderRadius: '10px',
  },
  navIcon: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748B',
    flexShrink: 0,
    transition: 'color 0.15s ease',
  },
  navIconActive: {
    color: '#EA580C',
  },
  navLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#334155',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
    transition: 'color 0.15s ease, font-weight 0.15s ease',
  },
  navLabelActive: {
    color: '#C2410C',
    fontWeight: 600,
  },
  activeOrangeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#EA580C',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  footerContainer: {
    borderTop: '1px solid #F1F5F9',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: 'auto',
    flexShrink: 0,
  },
  darkModeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderRadius: '8px',
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'background-color 0.15s ease',
  },
  darkModeText: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#475569',
    whiteSpace: 'nowrap',
  },
  userProfileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    width: '100%',
    boxSizing: 'border-box',
  },
  userAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1.5px solid #EA580C',
    flexShrink: 0,
  },
  userInfoWrapper: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    lineHeight: 1.2,
  },
  userName: {
    fontSize: '12.5px',
    fontWeight: 600,
    color: '#0F172A',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userRole: {
    fontSize: '10.5px',
    color: '#64748B',
    textTransform: 'lowercase',
  },
};
