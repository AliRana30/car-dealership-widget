'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  HiChevronDown,
  HiArrowRight,
  HiBars3,
  HiXMark,
  HiPhone,
  HiCalendarDays,
  HiGlobeAlt,
  HiBolt,
  HiSquares2X2,
  HiWrenchScrewdriver,
  HiCpuChip,
} from 'react-icons/hi2';

export default function FloatingGlassNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'features' | 'capabilities' | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Track page scroll to enhance shadow & backdrop blur on scroll
  useEffect(() => {
    function handleScroll() {
      if (window.scrollY > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const featureSubItems = [
    {
      title: 'AI Voice & Chat Agents',
      description: 'Human-like WebRTC voice and instant chat in one widget.',
      icon: HiPhone,
      bgColor: '#EFF6FF',
      iconColor: '#2563EB',
      href: '#features',
    },
    {
      title: 'Live Calendar Booking',
      description: 'Reads real-time availability and books appointments directly.',
      icon: HiCalendarDays,
      bgColor: '#FFF7ED',
      iconColor: '#EA580C',
      href: '#features',
    },
    {
      title: 'Smart Knowledge Base',
      description: 'Ingests your website data, FAQs, and product menus automatically.',
      icon: HiGlobeAlt,
      bgColor: '#ECFDF5',
      iconColor: '#059669',
      href: '#features',
    },
    {
      title: 'Fleet Dashboard & Analytics',
      description: 'Manage widgets, searchable transcripts, audio recordings, and tools.',
      icon: HiSquares2X2,
      bgColor: '#F3E8FF',
      iconColor: '#9333EA',
      href: '/dashboard',
    },
  ];

  const capabilitySubItems = [
    {
      name: 'Floating Web Widget',
      type: 'Embed JS',
      icon: HiSquares2X2,
      href: '#channels',
    },
    {
      name: 'Phone Lines & Telephony',
      type: 'SIP / Twilio',
      icon: HiPhone,
      href: '#channels',
    },
    {
      name: 'Catalog & Inventory Sync',
      type: 'Shopify / RSS',
      icon: HiCpuChip,
      href: '#channels',
    },
    {
      name: 'Autonomous Tab Navigation',
      type: 'Browser Tab',
      icon: HiWrenchScrewdriver,
      href: '#channels',
    },
  ];

  return (
    <header
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: '1024px',
        zIndex: 50,
        transition: 'all 0.3s ease',
      }}
    >
      {/* ── Embedded CSS for Responsive Layout & Micro-Interactions ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .origin-glass-pill {
          background: ${scrolled ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.88)'};
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 9999px;
          padding: 10px 24px;
          box-shadow: ${scrolled ? '0 10px 32px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)' : '0 6px 24px rgba(0, 0, 0, 0.05)'};
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          transition: all 0.3s ease;
        }

        .origin-brand-logo {
          width: 28px;
          height: 28px;
          object-fit: contain;
          display: block;
        }

        .origin-brand-title {
          font-weight: 700;
          color: #0F172A;
          font-size: 18px;
          letter-spacing: -0.02em;
        }

        .origin-nav-desktop {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .origin-nav-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .origin-mobile-btn {
          display: none;
        }

        .origin-nav-link {
          font-size: 14px;
          font-weight: 500;
          color: #475569;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          padding: 4px 0;
          cursor: pointer;
          transition: color 0.2s ease;
        }

        .origin-nav-link:hover {
          color: #2563EB;
        }

        .origin-dropdown-panel {
          position: absolute;
          top: calc(100% + 12px);
          left: 50%;
          transform: translateX(-50%);
          width: 320px;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 20px;
          box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.12);
          padding: 12px;
          z-index: 60;
          animation: originFadeIn 0.2s ease-out;
        }

        @keyframes originFadeIn {
          from { opacity: 0; transform: translate(-50%, -8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        .origin-dropdown-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 10px;
          border-radius: 12px;
          text-decoration: none;
          transition: background 0.2s ease;
        }

        .origin-dropdown-item:hover {
          background: rgba(241, 245, 249, 0.8);
        }

        .origin-cta-btn {
          background: #2563EB;
          color: #FFFFFF;
          font-size: 14px;
          font-weight: 600;
          padding: 7px 16px;
          border-radius: 9999px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.28);
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .origin-cta-btn:hover {
          background: #1D4ED8;
          transform: scale(1.02);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.38);
        }

        .origin-signin-btn {
          font-size: 14px;
          font-weight: 500;
          color: #334155;
          text-decoration: none;
          padding: 5px 12px;
          border-radius: 9999px;
          transition: all 0.2s ease;
        }

        .origin-signin-btn:hover {
          color: #0F172A;
          background: rgba(241, 245, 249, 0.8);
        }

        @media (max-width: 860px) {
          .origin-glass-pill {
            padding: 5px 14px !important;
            gap: 10px !important;
          }
          .origin-brand-logo {
            width: 24px !important;
            height: 24px !important;
          }
          .origin-brand-title {
            font-size: 16px !important;
          }
          .origin-nav-desktop, .origin-nav-actions {
            display: none !important;
          }
          .origin-mobile-btn {
            display: flex !important;
          }
        }
      ` }} />

      {/* ── Main Floating Glassmorphism Navbar Container ────────────────── */}
      <div ref={dropdownRef} className="origin-glass-pill">
        {/* Brand Logo & Title (Clean image logo directly next to text, no circle background, no AI badge) */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <img
            src="/logo.png"
            alt="Widgetized Logo"
            className="origin-brand-logo"
          />
          <span className="origin-brand-title">
            Widgetized
          </span>
        </Link>

        {/* Center Desktop Navigation Links */}
        <nav className="origin-nav-desktop">
          {/* Features Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'features' ? null : 'features')}
              className="origin-nav-link"
            >
              <span>Features</span>
              <HiChevronDown
                size={14}
                style={{
                  color: activeDropdown === 'features' ? '#2563EB' : '#94A3B8',
                  transform: activeDropdown === 'features' ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              />
            </button>

            {/* Features Sub-options Dropdown Panel */}
            {activeDropdown === 'features' && (
              <div className="origin-dropdown-panel">
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '4px 8px',
                    marginBottom: '4px',
                  }}
                >
                  Core Features
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {featureSubItems.map((item, idx) => {
                    const IconComp = item.icon;
                    return (
                      <a
                        key={idx}
                        href={item.href}
                        onClick={() => setActiveDropdown(null)}
                        className="origin-dropdown-item"
                      >
                        <div
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            background: item.bgColor,
                            color: item.iconColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <IconComp size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', lineHeight: 1.3 }}>
                            {item.description}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Capabilities / Integrations Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'capabilities' ? null : 'capabilities')}
              className="origin-nav-link"
            >
              <span>Capabilities</span>
              <HiChevronDown
                size={14}
                style={{
                  color: activeDropdown === 'capabilities' ? '#2563EB' : '#94A3B8',
                  transform: activeDropdown === 'capabilities' ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              />
            </button>

            {/* Capabilities Sub-options Dropdown Panel */}
            {activeDropdown === 'capabilities' && (
              <div className="origin-dropdown-panel" style={{ width: '280px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '4px 8px',
                    marginBottom: '4px',
                  }}
                >
                  Integration Channels
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {capabilitySubItems.map((item, idx) => {
                    const IconComp = item.icon;
                    return (
                      <a
                        key={idx}
                        href={item.href}
                        onClick={() => setActiveDropdown(null)}
                        className="origin-dropdown-item"
                        style={{ alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <IconComp size={16} style={{ color: '#2563EB' }} />
                          <span style={{ fontSize: '13px', fontWeight: 500, color: '#1E293B' }}>
                            {item.name}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 500,
                            color: '#64748B',
                            background: '#F1F5F9',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                          }}
                        >
                          {item.type}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <a href="#how-it-works" className="origin-nav-link">
            How It Works
          </a>

          <Link href="/dashboard" className="origin-nav-link" style={{ fontWeight: 600, color: '#2563EB' }}>
            Dashboard
          </Link>
        </nav>

        {/* Right Actions: Sign In & Primary CTA */}
        <div className="origin-nav-actions">
          <Link href="/login" className="origin-signin-btn">
            Sign In
          </Link>

          <Link href="/signup" className="origin-cta-btn">
            <span>Get Started Free</span>
            <HiArrowRight size={15} />
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="origin-mobile-btn"
          style={{
            background: 'none',
            border: 'none',
            padding: '6px',
            cursor: 'pointer',
            color: '#334155',
          }}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <HiXMark size={24} /> : <HiBars3 size={24} />}
        </button>
      </div>

      {/* ── Mobile Navigation Drawer Overlay ────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          style={{
            marginTop: '8px',
            borderRadius: '24px',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(226, 232, 240, 0.9)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>
            Navigation
          </div>

          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', textDecoration: 'none', color: '#1E293B', fontWeight: 500, fontSize: '14px' }}
          >
            <HiSquares2X2 size={18} style={{ color: '#2563EB' }} />
            <span>Features</span>
          </a>

          <a
            href="#channels"
            onClick={() => setMobileMenuOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', textDecoration: 'none', color: '#1E293B', fontWeight: 500, fontSize: '14px' }}
          >
            <HiCpuChip size={18} style={{ color: '#059669' }} />
            <span>Capabilities</span>
          </a>

          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', textDecoration: 'none', color: '#1E293B', fontWeight: 500, fontSize: '14px' }}
          >
            <HiWrenchScrewdriver size={18} style={{ color: '#EA580C' }} />
            <span>How It Works</span>
          </a>

          <Link
            href="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', textDecoration: 'none', color: '#2563EB', fontWeight: 600, fontSize: '14px' }}
          >
            <HiSquares2X2 size={18} style={{ color: '#9333EA' }} />
            <span>Fleet Dashboard</span>
          </Link>

          <div style={{ paddingTop: '12px', borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              style={{ padding: '10px', borderRadius: '9999px', textAlign: 'center', fontWeight: 500, fontSize: '14px', color: '#1E293B', border: '1px solid #CBD5E1', textDecoration: 'none' }}
            >
              Sign In
            </Link>

            <Link
              href="/signup"
              onClick={() => setMobileMenuOpen(false)}
              style={{ padding: '10px', borderRadius: '9999px', textAlign: 'center', fontWeight: 600, fontSize: '14px', color: '#FFFFFF', background: '#2563EB', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <span>Get Started Free</span>
              <HiArrowRight size={16} />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
