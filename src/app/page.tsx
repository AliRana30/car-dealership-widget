'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FloatingGlassNavbar from '@/components/navbar/FloatingGlassNavbar';

// ── Icon Helper ─────────────────────────────────────────────────────────────

function SvgIcon({ paths, size = 20, stroke = 1.75, color = 'currentColor', className = '' }: {
  paths: string[];
  size?: number;
  stroke?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

const PATHS = {
  phone: ['M6.6 4.2h3.4l1.3 5-2.5 1.6a12.4 12.4 0 0 0 5.9 5.9l1.6-2.5 5 1.3v3.4a2 2 0 0 1-2.1 2C10.7 20.2 3.8 13.3 3.1 5.9c-.1-1 .7-1.7 1.6-1.7z'],
  calendar: [
    'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z',
    'M4 9.5h16',
    'M8.5 2v4',
    'M15.5 2v4',
    'M8.8 13.4l1.8 1.8 3.4-3.4',
  ],
  message: ['M20 11.5c0 4.1-3.6 7.5-8 7.5-1.1 0-2.2-.2-3.1-.6L4 20l1.3-3.9A7.6 7.6 0 0 1 4 11.5C4 7.4 7.6 4 12 4s8 3.4 8 7.5z'],
  sparkles: [
    'M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z',
  ],
  globe: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    'M2 12h20',
    'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  ],
  compass: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    'M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z',
  ],
  layout: ['M4 4h6v9H4z', 'M14 4h6v5h-6z', 'M14 12h6v8h-6z', 'M4 16h6v4H4z'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  refresh: ['M20 12a8 8 0 0 1-14.2 5', 'M4 12a8 8 0 0 1 14.2-5', 'M19 3v5h-5', 'M5 21v-5h5'],
  widget: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
};

// ── Scroll Reveal Component ──────────────────────────────────────────────────

function ScrollReveal({
  children,
  className = '',
  style = {},
  threshold = 0.12,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  threshold?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${isVisible ? 'scroll-reveal-visible' : ''} ${className}`}
      style={{
        ...style,
        ...(delay ? { transitionDelay: `${delay}ms` } : {}),
      }}
    >
      {children}
    </div>
  );
}

// ── Headline Words for Staggered Animation ──────────────────────────────────
const LINE1_WORDS = ['Every', 'call', 'answered.'];
const LINE2_WORDS = ['Every', 'appointment', 'booked.'];

export default function HomePage() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroPhase, setHeroPhase] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);

  const carouselRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Hero cycle animation
  useEffect(() => {
    const timer = setInterval(() => {
      setHeroPhase((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Carousel autoplay — SCOPED TO CAROUSEL CONTAINER (never scrolls window)
  const startCarouselAutoPlay = useCallback(() => {
    if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    autoPlayTimerRef.current = setInterval(() => {
      setCarouselIndex((prev) => {
        const next = (prev + 1) % 5;
        if (carouselRef.current) {
          const card = carouselRef.current.children[next] as HTMLElement;
          if (card) {
            carouselRef.current.scrollTo({
              left: card.offsetLeft - carouselRef.current.offsetLeft,
              behavior: 'smooth',
            });
          }
        }
        return next;
      });
    }, 4500);
  }, []);

  useEffect(() => {
    startCarouselAutoPlay();
    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    };
  }, [startCarouselAutoPlay]);

  const scrollToCard = (index: number) => {
    if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    setCarouselIndex(index);
    if (carouselRef.current) {
      const card = carouselRef.current.children[index] as HTMLElement;
      if (card) {
        carouselRef.current.scrollTo({
          left: card.offsetLeft - carouselRef.current.offsetLeft,
          behavior: 'smooth',
        });
      }
    }
    setTimeout(startCarouselAutoPlay, 5000);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!carouselRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - carouselRef.current.offsetLeft;
    scrollLeftRef.current = carouselRef.current.scrollLeft;
    if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !carouselRef.current) return;
    e.preventDefault();
    const x = e.pageX - carouselRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    carouselRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  // Features Data
  const features = [
    {
      title: 'Live Calendar Booking',
      icon: <SvgIcon paths={PATHS.calendar} size={22} color="#FFFDF8" />,
      detail: 'Reads your real-time schedule, offers times that actually work, and books directly into your calendar.',
      tooltip: 'Bidirectional sync with Google Calendar, Outlook, and webhook integrations.',
    },
    {
      title: 'Answers Business FAQs',
      icon: <SvgIcon paths={PATHS.message} size={22} color="#FFFDF8" />,
      detail: 'Trained on your business hours, location, parking, policies, and service menus.',
      tooltip: 'Ingests website intelligence, sitemaps, and uploaded document knowledge.',
    },
    {
      title: 'Call Recordings & Transcripts',
      icon: <SvgIcon paths={PATHS.phone} size={22} color="#FFFDF8" />,
      detail: 'Listen to call recordings or read word-for-word transcripts of every caller interaction.',
      tooltip: 'Searchable conversation logs with extracted customer notes and booking intents.',
    },
    {
      title: 'Custom Voice & Tone',
      icon: <SvgIcon paths={PATHS.sparkles} size={22} color="#FFFDF8" />,
      detail: 'Choose the voice, accent, speaking pace, and brand personality that fits your business.',
      tooltip: 'Configurable greeting prompts, interruption sensitivity, and ambient noise filtering.',
    },
    {
      title: 'SMS Follow-Ups & Reminders',
      icon: <SvgIcon paths={PATHS.refresh} size={22} color="#FFFDF8" />,
      detail: 'Automatically texts confirmation details and calendar links to callers immediately after the call.',
      tooltip: 'Instant SMS notifications with customizable confirmation templates.',
    },
  ];

  // Integrations Marquee
  const integrations = [
    { name: 'Google Calendar', icon: <SvgIcon paths={PATHS.calendar} size={18} /> },
    { name: 'Outlook Calendar', icon: <SvgIcon paths={PATHS.calendar} size={18} /> },
    { name: 'Shopify Storefront', icon: <SvgIcon paths={PATHS.globe} size={18} /> },
    { name: 'WooCommerce API', icon: <SvgIcon paths={PATHS.refresh} size={18} /> },
    { name: 'Retell AI WebRTC', icon: <SvgIcon paths={PATHS.phone} size={18} /> },
    { name: 'Vapi AI Assistant', icon: <SvgIcon paths={PATHS.sparkles} size={18} /> },
    { name: 'Calendly Sync', icon: <SvgIcon paths={PATHS.calendar} size={18} /> },
  ];

  return (
    <div suppressHydrationWarning style={{ position: 'relative', isolation: 'isolate', fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: '#0E1B2A', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── Global Styles & Rich Animations ─────────────────────────────── */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes blobDriftA {
          0% { transform: translate(-6%, -4%) scale(1); }
          50% { transform: translate(4%, 6%) scale(1.08); }
          100% { transform: translate(-6%, -4%) scale(1); }
        }
        @keyframes blobDriftB {
          0% { transform: translate(5%, 4%) scale(1); }
          50% { transform: translate(-5%, -6%) scale(1.06); }
          100% { transform: translate(5%, 4%) scale(1); }
        }
        @keyframes wordEnter {
          0% { opacity: 0; transform: translateY(18px) scale(0.96); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(47,143,224,0.45); }
          70% { box-shadow: 0 0 0 24px rgba(47,143,224,0); }
          100% { box-shadow: 0 0 0 0 rgba(47,143,224,0); }
        }
        @keyframes floatIcon {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-12px) rotate(3deg); }
        }
        @keyframes floatCard {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes soundWave {
          0%, 100% { height: 6px; }
          50% { height: 28px; }
        }
        @keyframes marqueeScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .mfd-carousel-scroll::-webkit-scrollbar { display: none; }
        .mfd-carousel-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        
        .desktop-nav-items { display: flex; }
        .mobile-hamburger-btn { display: none; }
        .hero-grid-layout { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px; }

        .btn-hover-lift {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .btn-hover-lift:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px -6px rgba(47,143,224,0.45) !important;
        }

        @media (max-width: 900px) {
          .desktop-nav-items { display: none !important; }
          .mobile-hamburger-btn { display: flex !important; }
          .hero-grid-layout { grid-template-columns: 1fr !important; gap: 36px !important; }
        }

        /* Navbar clearance classes are intentionally kept but overridden by inline paddingTop */
      `}} />

      {/* ── Ambient Background Layer with Floating Elements ─────────────── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: '#E9F2FB', overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '60%', height: '60%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,143,224,0.22), transparent 70%)', filter: 'blur(50px)', animation: 'blobDriftA 24s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: '65%', height: '65%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(217,113,75,0.14), transparent 70%)', filter: 'blur(60px)', animation: 'blobDriftB 28s ease-in-out infinite' }} />

        {/* Floating background decorative icon badges */}
        <div style={{ position: 'absolute', top: '15%', left: '8%', opacity: 0.25, animation: 'floatIcon 8s ease-in-out infinite' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#2F8FE0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SvgIcon paths={PATHS.phone} size={22} color="#FFFFFF" />
          </div>
        </div>
        <div style={{ position: 'absolute', top: '22%', right: '12%', opacity: 0.25, animation: 'floatIcon 10s ease-in-out 1s infinite' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: '#D9714B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SvgIcon paths={PATHS.calendar} size={24} color="#FFFFFF" />
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: '25%', left: '12%', opacity: 0.2, animation: 'floatIcon 9s ease-in-out 2s infinite' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#2F8FE0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SvgIcon paths={PATHS.sparkles} size={20} color="#FFFFFF" />
          </div>
        </div>

        <div style={{ position: 'absolute', inset: 0, opacity: 0.07, backgroundImage: "url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2744%27 height=%2744%27%3E%3Cpath d=%27M44 0H0V44%27 fill=%27none%27 stroke=%27%236b6656%27 stroke-width=%271%27/%3E%3C/svg%3E')", backgroundSize: '44px 44px' }} />
      </div>

      {/* ── Floating Glassmorphism Navbar (Origin UI Pattern) ───────────── */}
      <FloatingGlassNavbar />

      {/* ── Hero Section (With Animated Words & Interactive Visual Card) ── */}
      <ScrollReveal>
        <section style={{ maxWidth: '1240px', margin: '0 auto', paddingTop: '140px', paddingRight: '32px', paddingBottom: '56px', paddingLeft: '32px' }}>
          <div className="hero-grid-layout" style={{ alignItems: 'center' }}>

            {/* Left Hero Copy */}
            <div>
              <h1 style={{ fontFamily: "'Figtree', sans-serif", letterSpacing: '-0.025em', margin: '0 0 16px' }}>
                {/* Line 1 with Word-by-Word Staggered Entrance */}
                <div style={{ fontSize: 'clamp(38px, 4.8vw, 62px)', fontWeight: 700, lineHeight: 0.98, color: '#0E1B2A', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {LINE1_WORDS.map((w, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: 'inline-block',
                        animation: `wordEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.08}s both`,
                      }}
                    >
                      {w}
                    </span>
                  ))}
                </div>

                {/* Line 2 with Word-by-Word Staggered Entrance */}
                <div style={{ fontSize: 'clamp(38px, 4.8vw, 62px)', fontWeight: 700, lineHeight: 1.05, marginTop: '6px', color: '#2F8FE0', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {LINE2_WORDS.map((w, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: 'inline-block',
                        animation: `wordEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${(idx + 3) * 0.08}s both`,
                      }}
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </h1>

              <p style={{
                fontSize: '18px', lineHeight: 1.6, color: 'rgba(14,27,42,0.72)', maxWidth: '460px', margin: '0 0 30px',
                animation: 'wordEnter 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.45s both',
              }}>
                An agent trained on your business's own hours, services, and calendar answers the call, books the appointment, and lets you review exactly what happened afterward.
              </p>

              {/* CTAs */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap', marginBottom: '32px',
                animation: 'wordEnter 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.55s both',
              }}>
                <Link
                  href="/signup"
                  className="btn-hover-lift"
                  style={{
                    padding: '14px 30px', borderRadius: '12px',
                    background: '#2F8FE0', color: '#FFFDF8',
                    fontSize: '15.5px', fontWeight: 600,
                    textDecoration: 'none', display: 'inline-block',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    boxShadow: '0 10px 24px -8px rgba(14,27,42,0.32)',
                    cursor: 'pointer',
                  }}
                >
                  Sign Up Free
                </Link>
                <a
                  href="#how-it-works"
                  style={{
                    fontSize: '14.5px', fontWeight: 600, color: '#2F8FE0',
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  See a call become a booking ↓
                </a>
              </div>

              {/* Feature Checklist */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '18px',
                animation: 'wordEnter 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.65s both',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(47,143,224,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                    <SvgIcon paths={PATHS.check} size={12} color="#2F8FE0" stroke={2.5} />
                  </div>
                  <span style={{ fontSize: '14.5px', lineHeight: 1.5, color: 'rgba(14,27,42,0.78)' }}>
                    Answers in under a second — no hold music, no voicemail tree
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(47,143,224,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                    <SvgIcon paths={PATHS.check} size={12} color="#2F8FE0" stroke={2.5} />
                  </div>
                  <span style={{ fontSize: '14.5px', lineHeight: 1.5, color: 'rgba(14,27,42,0.78)' }}>
                    Checks your live calendar and books directly into it
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(47,143,224,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                    <SvgIcon paths={PATHS.check} size={12} color="#2F8FE0" stroke={2.5} />
                  </div>
                  <span style={{ fontSize: '14.5px', lineHeight: 1.5, color: 'rgba(14,27,42,0.78)' }}>
                    Transcribes the call, notes preferences, and texts the client a confirmation
                  </span>
                </div>
              </div>
            </div>

            {/* Right Interactive Simulation Card */}
            <div style={{ animation: 'floatCard 6s ease-in-out infinite' }}>
              <div style={{
                position: 'relative', padding: '40px 32px', borderRadius: '24px',
                background: 'rgba(251,253,255,0.95)', border: '1px solid rgba(14,27,42,0.12)',
                boxShadow: '0 1px 2px rgba(14,27,42,0.06), 0 30px 60px -30px rgba(14,27,42,0.22)',
                minHeight: '340px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '22px', overflow: 'hidden',
              }}>
                {/* Pulsing Icon */}
                <div style={{
                  width: '76px', height: '76px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #2F8FE0, #1D6FB8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 0 0 rgba(47,143,224,0.45)',
                  animation: 'pulseRing 2.4s infinite',
                }}>
                  <SvgIcon paths={PATHS.phone} size={32} color="#FFFDF8" />
                </div>

                {/* Animated Sound Wave Bars */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '30px' }}>
                  {[0.4, 0.8, 0.5, 0.9, 0.6, 0.7, 0.3].map((delay, i) => (
                    <div
                      key={i}
                      style={{
                        width: '3.5px',
                        background: '#2F8FE0',
                        borderRadius: '2px',
                        animation: `soundWave 1.2s ease-in-out ${delay}s infinite`,
                      }}
                    />
                  ))}
                </div>

                {/* Status Label with Smooth Transition */}
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#0E1B2A', textAlign: 'center', transition: 'all 0.3s ease' }}>
                  {heroPhase === 0 && 'Inbound call answered'}
                  {heroPhase === 1 && 'Checking live availability...'}
                  {heroPhase === 2 && 'Appointment confirmed & calendar synced'}
                </div>

                {/* Calendar Action Pill */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '14px 20px', borderRadius: '14px',
                  background: 'rgba(47,143,224,0.14)', border: '1px solid rgba(47,143,224,0.3)',
                  boxShadow: '0 2px 8px rgba(47,143,224,0.15)',
                }}>
                  <SvgIcon paths={PATHS.calendar} size={18} color="#2F8FE0" />
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#2F8FE0' }}>
                    Thu 2:30 PM — booked
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── Integrations Marquee ────────────────────────────────────────── */}
      <ScrollReveal delay={100}>
        <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px' }}>
          <div style={{ height: '1px', background: 'rgba(14,27,42,0.1)', marginBottom: '20px' }} />
          <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(217,113,75,0.9)', marginBottom: '18px' }}>
            Works with what you already use
          </div>
          <div style={{ overflow: 'hidden', maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}>
            <div style={{ display: 'flex', width: 'max-content', gap: '56px', animation: 'marqueeScroll 28s linear infinite' }}>
              {[...integrations, ...integrations].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(14,27,42,0.55)', fontWeight: 600, fontSize: '14.5px' }}>
                  {item.icon}
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: '1px', background: 'rgba(14,27,42,0.1)', marginTop: '20px' }} />
        </section>
      </ScrollReveal>

      {/* ── Feature Carousel Grid ───────────────────────────────────────── */}
      <ScrollReveal delay={150}>
        <section id="features" style={{ maxWidth: '1240px', margin: '0 auto', padding: '64px 32px 56px' }}>
          <div style={{ maxWidth: '620px', margin: '0 auto 40px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
              Everything your front desk needs. Nothing it doesn't.
            </h2>
            <p style={{ fontSize: '16px', color: 'rgba(14,27,42,0.68)', margin: 0 }}>
              Five things, done thoroughly, instead of a hundred things done halfway.
            </p>
          </div>

          {/* Horizontal Carousel */}
          <div
            ref={carouselRef}
            className="mfd-carousel-scroll"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
              display: 'flex', gap: '20px', overflowX: 'auto',
              scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
              cursor: 'grab', padding: '8px 4px 16px', userSelect: 'none',
            }}
          >
            {features.map((feat, i) => (
              <div
                key={i}
                style={{
                  flex: '0 0 320px', minWidth: '320px', scrollSnapAlign: 'start',
                  padding: '28px', borderRadius: '20px', background: 'rgba(255,255,255,0.92)',
                  border: '1px solid rgba(14,27,42,0.12)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 16px 32px -16px rgba(14,27,42,0.12)',
                  display: 'flex', flexDirection: 'column', position: 'relative',
                }}
              >
                <div
                  onMouseEnter={() => setActiveTooltip(i)}
                  onMouseLeave={() => setActiveTooltip(null)}
                  style={{
                    width: '48px', height: '48px', borderRadius: '14px',
                    background: '#2F8FE0', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', marginBottom: '18px', position: 'relative',
                  }}
                >
                  {feat.icon}
                  {activeTooltip === i && (
                    <div style={{
                      position: 'absolute', top: '56px', left: 0, zIndex: 10,
                      width: '240px', padding: '10px 14px', borderRadius: '10px',
                      background: '#0E1B2A', color: '#FFFDF8', fontSize: '12px',
                      lineHeight: 1.5, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                    }}>
                      {feat.tooltip}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#0E1B2A' }}>
                  {feat.title}
                </div>
                <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'rgba(14,27,42,0.65)' }}>
                  {feat.detail}
                </div>
              </div>
            ))}
          </div>

          {/* Carousel Dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
            {features.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToCard(i)}
                aria-label={`Scroll to feature ${i + 1}`}
                style={{
                  width: carouselIndex === i ? '24px' : '8px', height: '8px',
                  borderRadius: '4px', background: carouselIndex === i ? '#2F8FE0' : 'rgba(14,27,42,0.2)',
                  border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ── Capabilities Channels Section ───────────────────────────────── */}
      <ScrollReveal delay={150}>
        <section id="channels" style={{ maxWidth: '1240px', margin: '0 auto', padding: '48px 32px' }}>
          <div style={{ maxWidth: '580px', margin: '0 auto 40px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
              Works right alongside what you already use
            </h2>
            <p style={{ fontSize: '16px', color: 'rgba(14,27,42,0.68)', margin: 0 }}>
              No new accounts, no new devices. It plugs into your existing phone line, calendar, and texts.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
            {[
              { name: 'Floating Web Widget', detail: 'Embed on any site via public/widget.js', icon: <SvgIcon paths={PATHS.widget} size={20} color="#2F8FE0" /> },
              { name: 'Direct Inbound Phone Lines', detail: 'Connect custom SIP & Twilio telephony', icon: <SvgIcon paths={PATHS.phone} size={20} color="#2F8FE0" /> },
              { name: 'Inventory & Catalog Sync', detail: 'Shopify, WooCommerce & RSS feeds', icon: <SvgIcon paths={PATHS.refresh} size={20} color="#2F8FE0" /> },
              { name: 'Host Page Navigation', detail: 'Autonomous browser tab navigation', icon: <SvgIcon paths={PATHS.compass} size={20} color="#2F8FE0" /> },
            ].map((ch, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '20px', borderRadius: '16px', background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(14,27,42,0.12)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(47,143,224,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {ch.icon}
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0E1B2A' }}>{ch.name}</div>
                  <div style={{ fontSize: '12.5px', color: 'rgba(14,27,42,0.6)' }}>{ch.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ── How It Works (3 Stages) ─────────────────────────────────────── */}
      <ScrollReveal delay={150}>
        <section id="how-it-works" style={{ maxWidth: '1100px', margin: '0 auto', padding: '56px 32px 64px' }}>
          <div style={{ maxWidth: '580px', margin: '0 auto 48px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
              What happens on a real call
            </h2>
            <p style={{ fontSize: '16px', color: 'rgba(14,27,42,0.68)', margin: 0 }}>
              An administrative front desk, start to finish — no clinical decisions, just the calendar and paperwork handled.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {[
              {
                step: '1',
                title: 'Visitor Asks by Voice or Text',
                detail: 'Ultra-low latency speech recognition captures the visitor\'s intent with zero lag.',
              },
              {
                step: '2',
                title: 'Agent Checks Live Intelligence',
                detail: 'Grounded RAG retrieval queries crawled website data, vehicle inventory, and service packages.',
              },
              {
                step: '3',
                title: 'Actions & Navigation Triggered',
                detail: 'The agent answers questions, opens requested product pages on screen, and schedules appointments.',
              },
            ].map((st, i) => (
              <div key={i} style={{ padding: '32px 24px', borderRadius: '20px', background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(14,27,42,0.12)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#2F8FE0', color: '#FFFDF8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, marginBottom: '20px' }}>
                  {st.step}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0E1B2A', marginBottom: '8px' }}>
                  {st.title}
                </div>
                <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'rgba(14,27,42,0.65)' }}>
                  {st.detail}
                </div>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ── Final Call to Action ────────────────────────────────────────── */}
      <ScrollReveal delay={150}>
        <section style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 32px 96px' }}>
          <div style={{ textAlign: 'center', padding: '64px 36px', borderRadius: '28px', background: '#0E1B2A', color: '#FFFDF8', boxShadow: '0 24px 64px -12px rgba(14,27,42,0.35)' }}>
            <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 42px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 16px' }}>
              Be one of the first dealerships on AutoMate
            </h2>
            <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.72)', maxWidth: '520px', margin: '0 auto 36px' }}>
              Start answering every caller and retrieving every vehicle automatically.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <Link
                href="/signup"
                className="btn-hover-lift"
                style={{
                  padding: '14px 32px', borderRadius: '12px',
                  background: '#2F8FE0', color: '#FFFDF8',
                  fontSize: '15px', fontWeight: 700,
                  textDecoration: 'none', display: 'inline-block',
                  boxShadow: '0 6px 20px rgba(47,143,224,0.4)',
                  cursor: 'pointer',
                }}
              >
                Sign Up Free
              </Link>
              <Link
                href="/login"
                style={{
                  padding: '14px 28px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.12)', color: '#FFFDF8',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: '15px', fontWeight: 600,
                  textDecoration: 'none', display: 'inline-block',
                  cursor: 'pointer',
                }}
              >
                Login
              </Link>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <ScrollReveal delay={100}>
        <footer style={{ borderTop: '1px solid rgba(14,27,42,0.1)', background: 'rgba(233,242,251,0.6)', padding: '48px 32px 36px' }}>
          <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '32px', marginBottom: '32px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <img src="/automate.png" alt="AutoMate Logo" style={{ height: '36px', width: 'auto', maxHeight: '40px', objectFit: 'contain' }} />
              </div>
              <p style={{ fontSize: '13.5px', color: 'rgba(14,27,42,0.7)', lineHeight: 1.6, maxWidth: '280px', margin: 0 }}>
                The complete autonomous AI voice, text, and inventory intelligence platform for automotive dealerships.
              </p>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(217,113,75,0.85)', marginBottom: '12px' }}>
                Product
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Link href="/dashboard" style={{ fontSize: '13.5px', color: '#0E1B2A', textDecoration: 'none' }}>Fleet Dashboard</Link>
                <a href="#features" style={{ fontSize: '13.5px', color: '#0E1B2A', textDecoration: 'none' }}>Features & Tools</a>
                <a href="#how-it-works" style={{ fontSize: '13.5px', color: '#0E1B2A', textDecoration: 'none' }}>How It Works</a>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(217,113,75,0.85)', marginBottom: '12px' }}>
                Account & Access
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Link href="/login" style={{ fontSize: '13.5px', color: '#0E1B2A', textDecoration: 'none' }}>Login</Link>
                <Link href="/signup" style={{ fontSize: '13.5px', color: '#0E1B2A', textDecoration: 'none' }}>Sign Up</Link>
                <Link href="/forgot-password" style={{ fontSize: '13.5px', color: '#0E1B2A', textDecoration: 'none' }}>Reset Password</Link>
              </div>
            </div>
          </div>

          <div style={{ maxWidth: '1240px', margin: '0 auto', paddingTop: '24px', borderTop: '1px solid rgba(14,27,42,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: 'rgba(14,27,42,0.6)' }}>
              © 2026 AutoMate. All rights reserved.
            </span>
            <span style={{ fontSize: '13px', color: 'rgba(14,27,42,0.6)' }}>
              Autonomous AI Dealership Intelligence Platform
            </span>
          </div>
        </footer>
      </ScrollReveal>
    </div>
  );
}
