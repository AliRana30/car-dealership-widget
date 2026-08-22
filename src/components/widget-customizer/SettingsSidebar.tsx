'use client';
import React, { useState, useEffect } from 'react';
import {
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
  LogOut,
  Home,
} from 'lucide-react';
import { CustomizerSection, SECTION_NAV } from './customizerTypes';

interface Props {
  active: CustomizerSection;
  onSelect: (s: CustomizerSection) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const SECTION_ICONS: Record<CustomizerSection, React.ReactNode> = {
  branding: <Home size={17} strokeWidth={2} />,
  colors: <Palette size={17} strokeWidth={2} />,
  typography: <Type size={17} strokeWidth={2} />,
  launcher: <CircleDot size={17} strokeWidth={2} />,
  panel: <LayoutTemplate size={17} strokeWidth={2} />,
  behavior: <Sliders size={17} strokeWidth={2} />,
  responsive: <Smartphone size={17} strokeWidth={2} />,
  crawler: <Globe2 size={17} strokeWidth={2} />,
  deploy: <Rocket size={17} strokeWidth={2} />,
};

export default function SettingsSidebar({
  active,
  onSelect,
  isCollapsed = false,
  onToggleCollapse,
}: Props) {
  const [userName, setUserName] = useState('Ali Mahmood Rana');
  const [userAvatar, setUserAvatar] = useState('https://lh3.googleusercontent.com/a/ACg8ocLglB3D4Kcc5eVz_h0dxZLqZanOJ4JOJAZ3nAiMIjMYYfpnDg=s96-c');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.user) {
          setUserName(data.user.name || data.user.email?.split('@')[0] || 'Ali Mahmood Rana');
          if (data.user.avatar) {
            setUserAvatar(data.user.avatar);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    window.location.href = '/login';
  };

  return (
    <>
      <aside
        style={{
          ...styles.sidebar,
          width: isCollapsed ? '52px' : '150px',
          minWidth: isCollapsed ? '52px' : '150px',
        }}
        className={`customizer-sidebar ${isCollapsed ? 'is-collapsed' : ''}`}
      >
        {/* Floating Arrow Toggle Button on the sidebar border line at top */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            style={styles.floatingArrowBtn}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight size={12} strokeWidth={2.5} color="#2563EB" />
            ) : (
              <ChevronLeft size={12} strokeWidth={2.5} color="#2563EB" />
            )}
          </button>
        )}

        {/* Navigation List starting immediately from top with no blank section */}
        <nav
          style={{
            ...styles.nav,
            padding: isCollapsed ? '12px 6px 6px' : '12px 8px 6px',
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
                  padding: isCollapsed ? '9px 0' : '8px 10px',
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

                {/* Blue Active Dot on Right (Expanded) */}
                {isActive && !isCollapsed && (
                  <span style={styles.activeBlueDot} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Footer Section: User Avatar + Name + Logout Icon Button */}
        <div
          style={{
            ...styles.footerContainer,
            padding: isCollapsed ? '10px 4px' : '10px 8px',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              ...styles.userProfileRow,
              justifyContent: isCollapsed ? 'center' : 'space-between',
            }}
          >
            <div style={styles.userInfoGroup} title={userName}>
              <img
                src={userAvatar}
                alt={userName}
                style={styles.userAvatar}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=Ali+Rana&background=2563EB&color=fff';
                }}
              />
              {!isCollapsed && (
                <span style={styles.userName}>
                  {userName}
                </span>
              )}
            </div>

            {/* Sleek Logout Icon Button */}
            {!isCollapsed && (
              <button
                onClick={() => setShowLogoutModal(true)}
                style={styles.logoutIconBtn}
                title="Log out"
                aria-label="Log out"
              >
                <LogOut size={14} strokeWidth={2.2} color="#DC2626" />
              </button>
            )}
          </div>

          {/* If collapsed, show the logout button underneath the avatar */}
          {isCollapsed && (
            <button
              onClick={() => setShowLogoutModal(true)}
              style={{ ...styles.logoutIconBtn, marginTop: '6px' }}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={13} strokeWidth={2.2} color="#DC2626" />
            </button>
          )}
        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div
          onClick={() => !isLoggingOut && setShowLogoutModal(false)}
          style={styles.modalOverlay}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={styles.modalCard}
          >
            <div style={styles.modalHeader}>
              <div style={styles.modalIconWrap}>
                <LogOut size={20} color="#DC2626" strokeWidth={2.2} />
              </div>
              <div>
                <h3 style={styles.modalTitle}>Log Out Confirmation</h3>
                <p style={styles.modalDesc}>Are you sure you want to log out of your session?</p>
              </div>
            </div>

            <div style={styles.modalActions}>
              <button
                disabled={isLoggingOut}
                onClick={() => setShowLogoutModal(false)}
                style={styles.btnCancel}
              >
                Cancel
              </button>
              <button
                disabled={isLoggingOut}
                onClick={handleConfirmLogout}
                style={styles.btnLogout}
              >
                {isLoggingOut ? 'Logging out…' : 'Log Out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    borderRight: '1px solid #E2E8F0',
    background: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'relative',
    zIndex: 25,
    height: '100%',
    overflow: 'visible',
  },
  floatingArrowBtn: {
    position: 'absolute',
    right: '-11px',
    top: '12px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: '#FFFFFF',
    border: '1px solid #CBD5E1',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 50,
    padding: 0,
    transition: 'transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    flex: '1 1 auto',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
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
    transition: 'background-color 0.15s ease, color 0.15s ease',
    width: '100%',
    boxSizing: 'border-box',
  },
  navItemActive: {
    background: '#EFF6FF',
    boxShadow: 'inset 3px 0 0 0 #2563EB',
    borderRadius: '8px',
  },
  navIcon: {
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748B',
    flexShrink: 0,
    transition: 'color 0.15s ease',
  },
  navIconActive: {
    color: '#2563EB',
  },
  navLabel: {
    fontSize: '12.5px',
    fontWeight: 500,
    color: '#334155',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
    transition: 'color 0.15s ease, font-weight 0.15s ease',
  },
  navLabelActive: {
    color: '#1D4ED8',
    fontWeight: 600,
  },
  activeBlueDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#2563EB',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  footerContainer: {
    borderTop: '1px solid #F1F5F9',
    display: 'flex',
    flexDirection: 'column',
    marginTop: 'auto',
    flexShrink: 0,
    width: '100%',
    boxSizing: 'border-box',
  },
  userProfileRow: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    boxSizing: 'border-box',
  },
  userInfoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    overflow: 'hidden',
    flex: 1,
  },
  userAvatar: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1.5px solid #2563EB',
    flexShrink: 0,
  },
  userName: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#0F172A',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  logoutIconBtn: {
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: '6px',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalCard: {
    background: '#FFFFFF',
    borderRadius: '14px',
    padding: '22px 24px',
    maxWidth: '360px',
    width: '90%',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '18px',
  },
  modalIconWrap: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: '#FEE2E2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#0F172A',
    margin: '0 0 4px',
  },
  modalDesc: {
    fontSize: '12.5px',
    color: '#64748B',
    margin: 0,
    lineHeight: 1.4,
  },
  modalActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  btnCancel: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
    background: '#FFFFFF',
    fontSize: '12.5px',
    fontWeight: 500,
    color: '#475569',
    cursor: 'pointer',
  },
  btnLogout: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: 'none',
    background: '#DC2626',
    fontSize: '12.5px',
    fontWeight: 600,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
};
