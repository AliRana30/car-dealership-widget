"use client";

import React, { Component } from 'react';
import VoiceAgentWidget, { CallState, VoiceAgentWidgetRef } from '@/components/voice-agent/VoiceAgentWidget';
import FloatingVoiceWidget from '@/components/voice-agent/FloatingVoiceWidget';


// Icon path definitions
const PHONE_PATH = ['M6.6 4.2h3.4l1.3 5-2.5 1.6a12.4 12.4 0 0 0 5.9 5.9l1.6-2.5 5 1.3v3.4a2 2 0 0 1-2.1 2C10.7 20.2 3.8 13.3 3.1 5.9c-.1-1 .7-1.7 1.6-1.7z'];
const CALENDAR_PATHS = ['M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z','M4 9.5h16','M8.5 2v4','M15.5 2v4','M8.8 13.4l1.8 1.8 3.4-3.4'];
const MESSAGE_PATHS = ['M20 11.5c0 4.1-3.6 7.5-8 7.5-1.1 0-2.2-.2-3.1-.6L4 20l1.3-3.9A7.6 7.6 0 0 1 4 11.5C4 7.4 7.6 4 12 4s8 3.4 8 7.5z'];
const REFRESH_PATHS = ['M20 12a8 8 0 0 1-14.2 5','M4 12a8 8 0 0 1 14.2-5','M19 3v5h-5','M5 21v-5h5'];
const LAYOUT_PATHS = ['M4 4h6v9H4z','M14 4h6v5h-6z','M14 12h6v8h-6z','M4 16h6v4H4z'];
const MENU_PATHS = ['M4 6h16','M4 12h16','M4 18h16'];
const CLOSE_PATHS = ['M6 6l12 12','M18 6L6 18'];
const CHECK_PATHS = ['M5 12.5l4.5 4.5L19 7'];
const BARCHART_PATHS = ['M4 20V10','M12 20V4','M20 20v-7'];
const MAIL_PATHS = ['M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z','M5 6.5l7 5 7-5'];

function renderIcon(paths: string[], size = 20, stroke = 1.75, color = 'currentColor') {
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
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

interface State {
  mobileOpen: boolean;
  visible: Record<string, boolean>;
  scrollY: number;
  isMobile: boolean;
  hoverKey: string | null;
  heroPhase: number;
  tooltipIdx: number | null;
  reduceMotion: boolean;
  carouselIndex: number;
  stageLineLeftPx: number;
  stageLineSpanPx: number;
  stageLineTopPx: number;
  // Retell Call States
  callState: CallState;
  isMuted: boolean;
  agentSpeaking: boolean;
  userSpeaking: boolean;
  transcript: string;
  errorMessage: string | null;
}

export default class Page extends Component<{}, State> {
  state: State = {
    mobileOpen: false,
    visible: {},
    scrollY: 0,
    isMobile: false,
    hoverKey: null,
    heroPhase: 0,
    tooltipIdx: null,
    reduceMotion: false,
    carouselIndex: 0,
    stageLineLeftPx: 0,
    stageLineSpanPx: 0,
    stageLineTopPx: 34,
    // Retell states
    callState: 'idle',
    isMuted: false,
    agentSpeaking: false,
    userSpeaking: false,
    transcript: '',
    errorMessage: null
  };

  widgetRef = React.createRef<VoiceAgentWidgetRef>();

  refCache: Record<string, (node: HTMLElement | null) => void> = {};
  hoverRefCache: Record<string, () => void> = {};
  mql: MediaQueryList | null = null;
  reduceMotionMql: MediaQueryList | null = null;
  heroInterval: NodeJS.Timeout | null = null;
  nodeRegistry: Record<string, HTMLElement> = {};
  pinWrapNode: HTMLElement | null = null;
  heroSectionNode: HTMLElement | null = null;
  carouselNode: HTMLDivElement | null = null;
  carouselCardNodes: Record<number, HTMLDivElement> = {};
  carouselCardRefCache: Record<number, (node: HTMLDivElement | null) => void> = {};
  carouselDotClickCache: Record<string | number, () => void> = {};
  carouselAutoTimer: NodeJS.Timeout | null = null;
  carouselResumeTimer: NodeJS.Timeout | null = null;
  carouselDragging = false;
  carouselDragStartX = 0;
  carouselDragStartScroll = 0;
  stageWrapNode: HTMLDivElement | null = null;
  stageCircleNodes: Record<number, HTMLDivElement> = {};
  stageCircleRefCache: Record<number, (node: HTMLDivElement | null) => void> = {};

  carouselRef = (node: HTMLDivElement | null) => {
    this.carouselNode = node;
  };

  carouselCardRef(i: number) {
    if (!this.carouselCardRefCache[i]) {
      this.carouselCardRefCache[i] = (node) => {
        if (node) {
          this.carouselCardNodes[i] = node;
          this.nodeRegistry['feat-' + i] = node;
          this.checkVisibility();
        } else {
          delete this.carouselCardNodes[i];
          delete this.nodeRegistry['feat-' + i];
        }
      };
    }
    return this.carouselCardRefCache[i];
  }

  carouselDotClick(i: number) {
    if (!this.carouselDotClickCache[i]) {
      this.carouselDotClickCache[i] = () => {
        this.stopCarouselAutoplay();
        this.scrollCarouselTo(i);
        if (this.carouselResumeTimer) clearTimeout(this.carouselResumeTimer);
        this.carouselResumeTimer = setTimeout(() => this.startCarouselAutoplay(), 3000);
      };
    }
    return this.carouselDotClickCache[i];
  }

  scrollCarouselTo = (idx: number) => {
    const node = this.carouselCardNodes[idx];
    if (node && this.carouselNode) {
      const contRect = this.carouselNode.getBoundingClientRect();
      const cardRect = node.getBoundingClientRect();
      const delta = cardRect.left - contRect.left;
      this.carouselNode.scrollTo({
        left: this.carouselNode.scrollLeft + delta,
        behavior: 'smooth'
      });
    }
    this.setState({ carouselIndex: idx });
  };

  startCarouselAutoplay = () => {
    this.stopCarouselAutoplay();
    this.carouselAutoTimer = setInterval(() => {
      this.scrollCarouselTo((this.state.carouselIndex + 1) % 5);
    }, 4500);
  };

  stopCarouselAutoplay = () => {
    if (this.carouselAutoTimer) clearInterval(this.carouselAutoTimer);
  };

  onCarouselScroll = () => {
    if (!this.carouselNode) return;
    const contRect = this.carouselNode.getBoundingClientRect();
    let nearest = 0, minDist = Infinity;
    Object.keys(this.carouselCardNodes).forEach((k) => {
      const idx = Number(k);
      const node = this.carouselCardNodes[idx];
      if (!node) return;
      const dist = Math.abs(node.getBoundingClientRect().left - contRect.left);
      if (dist < minDist) {
        minDist = dist;
        nearest = idx;
      }
    });
    if (nearest !== this.state.carouselIndex) this.setState({ carouselIndex: nearest });
  };

  onCarouselPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    this.carouselDragging = true;
    this.carouselDragStartX = e.clientX;
    this.carouselDragStartScroll = this.carouselNode ? this.carouselNode.scrollLeft : 0;
    this.stopCarouselAutoplay();
    if (this.carouselResumeTimer) clearTimeout(this.carouselResumeTimer);
  };

  onCarouselPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!this.carouselDragging || !this.carouselNode) return;
    this.carouselNode.scrollLeft = this.carouselDragStartScroll - (e.clientX - this.carouselDragStartX);
  };

  onCarouselPointerUp = () => {
    if (!this.carouselDragging) return;
    this.carouselDragging = false;
    if (this.carouselResumeTimer) clearTimeout(this.carouselResumeTimer);
    this.carouselResumeTimer = setTimeout(() => this.startCarouselAutoplay(), 3000);
  };

  onCarouselMouseEnter = () => {
    this.stopCarouselAutoplay();
  };

  onCarouselMouseLeave = () => {
    if (!this.carouselDragging) {
      if (this.carouselResumeTimer) clearTimeout(this.carouselResumeTimer);
      this.carouselResumeTimer = setTimeout(() => this.startCarouselAutoplay(), 800);
    }
  };

  pinWrapRef = (node: HTMLDivElement | null) => {
    this.pinWrapNode = node;
  };

  heroSectionRef = (node: HTMLElement | null) => {
    this.heroSectionNode = node;
  };

  stageWrapRef = (node: HTMLDivElement | null) => {
    this.stageWrapNode = node;
  };

  stageCircleRef(i: number) {
    if (!this.stageCircleRefCache[i]) {
      this.stageCircleRefCache[i] = (node: HTMLDivElement | null) => {
        if (node) {
          this.stageCircleNodes[i] = node;
          this.measureStageLine();
        } else {
          delete this.stageCircleNodes[i];
        }
      };
    }
    return this.stageCircleRefCache[i];
  }

  measureStageLine = () => {
    const c0 = this.stageCircleNodes[0];
    const c2 = this.stageCircleNodes[2];
    if (!c0 || !c2 || !this.stageWrapNode) return;
    const wrapRect = this.stageWrapNode.getBoundingClientRect();
    const r0 = c0.getBoundingClientRect();
    const r2 = c2.getBoundingClientRect();
    const leftPx = (r0.left + r0.width / 2) - wrapRect.left;
    const topPx = (r0.top + r0.height / 2) - wrapRect.top;
    const spanPx = (r2.left + r2.width / 2) - (r0.left + r0.width / 2);
    if (
      leftPx !== this.state.stageLineLeftPx ||
      spanPx !== this.state.stageLineSpanPx ||
      topPx !== this.state.stageLineTopPx
    ) {
      this.setState({ stageLineLeftPx: leftPx, stageLineSpanPx: spanPx, stageLineTopPx: topPx });
    }
  };

  onReduceMotionChange = (e: MediaQueryListEvent) => {
    this.setState({ reduceMotion: e.matches });
  };

  onScroll = () => {
    const y = window.scrollY;
    if (Math.abs(y - this.state.scrollY) > 2) this.setState({ scrollY: y });
    this.checkVisibility();
  };

  onMqlChange = (e: MediaQueryListEvent) => {
    this.setState({ isMobile: e.matches });
  };

  componentDidMount() {
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.measureStageLine);
    this.mql = window.matchMedia('(max-width: 860px)');
    this.setState({ isMobile: this.mql.matches });
    this.mql.addEventListener('change', this.onMqlChange);
    this.reduceMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.setState({ reduceMotion: this.reduceMotionMql.matches });
    this.reduceMotionMql.addEventListener('change', this.onReduceMotionChange);
    this.heroInterval = setInterval(() => {
      this.setState((s) => ({ heroPhase: (s.heroPhase + 1) % 3 }));
    }, 2300);
    this.checkVisibility();
    this.measureStageLine();
    setTimeout(this.measureStageLine, 800);
    this.startCarouselAutoplay();
  }

  componentWillUnmount() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.measureStageLine);
    if (this.mql) this.mql.removeEventListener('change', this.onMqlChange);
    if (this.reduceMotionMql) this.reduceMotionMql.removeEventListener('change', this.onReduceMotionChange);
    if (this.heroInterval) clearInterval(this.heroInterval);
    this.stopCarouselAutoplay();
    if (this.carouselResumeTimer) clearTimeout(this.carouselResumeTimer);
  }

  checkVisibility = () => {
    const vh = window.innerHeight || 800;
    let changed = false;
    const next = { ...this.state.visible };
    Object.keys(this.nodeRegistry).forEach((key) => {
      if (next[key]) return;
      const node = this.nodeRegistry[key];
      if (!node || !node.isConnected) return;
      const rect = node.getBoundingClientRect();
      if (rect.top < vh * 0.92 && rect.bottom > 0) {
        next[key] = true;
        changed = true;
      }
    });
    if (changed) {
      this.setState({ visible: next });
      setTimeout(this.measureStageLine, 750);
    }
  };

  startCall = () => {
    if (this.widgetRef.current) {
      this.widgetRef.current.startCall();
    }
  };

  stopCall = () => {
    if (this.widgetRef.current) {
      this.widgetRef.current.stopCall();
    }
  };

  pauseHeroInterval = () => {
    if (this.heroInterval) {
      clearInterval(this.heroInterval);
      this.heroInterval = null;
    }
  };

  resumeHeroInterval = () => {
    this.pauseHeroInterval();
    this.heroInterval = setInterval(() => {
      this.setState((s) => ({ heroPhase: (s.heroPhase + 1) % 3 }));
    }, 2300);
  };


  toggleMobile = () => {
    this.setState((s) => ({ mobileOpen: !s.mobileOpen }));
  };

  setHoverKey(key: string) {
    if (!this.hoverRefCache[key]) {
      this.hoverRefCache[key] = () => this.setState({ hoverKey: key });
    }
    return this.hoverRefCache[key];
  }

  clearHover = () => {
    this.setState({ hoverKey: null });
  };

  setTooltip(idx: number) {
    const key = 'tt' + idx;
    if (!this.hoverRefCache[key]) {
      this.hoverRefCache[key] = () => this.setState({ tooltipIdx: idx });
    }
    return this.hoverRefCache[key];
  }

  clearTooltip = () => {
    this.setState({ tooltipIdx: null });
  };

  revealRef(key: string) {
    if (!this.refCache[key]) {
      this.refCache[key] = (node) => {
        if (node) {
          this.nodeRegistry[key] = node;
          this.checkVisibility();
        } else {
          delete this.nodeRegistry[key];
        }
      };
    }
    return this.refCache[key];
  }

  revealStyle(key: string, delay: number): React.CSSProperties {
    const v = !!this.state.visible[key];
    return {
      opacity: v ? 1 : 0,
      transform: `translateY(${v ? 0 : 24}px)`,
      transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`
    };
  }

  render() {
    const isMobile = this.state.isMobile;
    const reduceMotion = this.state.reduceMotion;
    const isCallActive = ['connected', 'agent_speaking', 'user_listening', 'muted', 'ending'].includes(this.state.callState);
    const isLoading = ['connecting', 'permission_required'].includes(this.state.callState);

    const navLinksData = [
      { key: 'features', label: 'Features', href: '#features' },
      { key: 'how', label: 'How it works', href: '#how-it-works' },
      { key: 'contact', label: 'Contact Us', href: '#final-cta' }
    ];

    const navLinks = navLinksData.map((l) => ({
      ...l,
      onEnter: this.setHoverKey(l.key),
      underlineStyle: {
        width: this.state.hoverKey === l.key ? '100%' : '0%',
        transition: 'width 0.3s ease'
      }
    }));

    const scrollProgress = Math.min(this.state.scrollY / 80, 1);
    const headerStyle: React.CSSProperties = {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      paddingTop: `${22 - scrollProgress * 10}px`,
      paddingBottom: `${22 - scrollProgress * 10}px`,
      background: 'transparent',
      backdropFilter: scrollProgress > 0.02 ? `blur(${scrollProgress * 16}px)` : 'none',
      WebkitBackdropFilter: scrollProgress > 0.02 ? `blur(${scrollProgress * 16}px)` : 'none',
      borderBottom: `1px solid rgba(14,27,42,${scrollProgress * 0.15})`,
      transition: 'padding 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease'
    };

    const heroPinStyle: React.CSSProperties = reduceMotion
      ? {}
      : { position: 'sticky', top: 0, zIndex: 1 };

    const featPinStyle: React.CSSProperties = reduceMotion
      ? {}
      : {
          position: 'relative',
          zIndex: 2,
          borderTopLeftRadius: '40px',
          borderTopRightRadius: '40px',
          background: '#E9F2FB',
          boxShadow: '0 -24px 50px -20px rgba(14,27,42,0.18)'
        };

    const headlineLine1Defs = [
      { text: 'Never', size: 'clamp(46px,6vw,68px)', weight: 700 },
      { text: 'miss', size: 'clamp(46px,6vw,68px)', weight: 700 }
    ];
    const headlineLine2Defs = [
      { text: 'another', size: 'clamp(36px,4.6vw,52px)', weight: 400 },
      { text: 'call.', size: 'clamp(36px,4.6vw,52px)', weight: 400 }
    ];

    const headlineWords = headlineLine1Defs.map((w, i) => ({
      text: w.text,
      style: {
        ...this.revealStyle('hero-text', i * 0.09),
        fontSize: w.size,
        fontWeight: w.weight,
        display: 'inline-block',
        marginRight: '0.14em'
      }
    }));

    const headlineWordsLine2 = headlineLine2Defs.map((w, i) => ({
      text: w.text,
      style: {
        ...this.revealStyle('hero-text', (i + 2) * 0.09),
        fontSize: w.size,
        fontWeight: w.weight,
        display: 'inline-block',
        marginRight: '0.14em',
        color: '#D9714B'
      }
    }));

    const capabilities = [
      'Answers every call, day or night',
      'Books straight into your calendar',
      'Trained on your business, not a generic script'
    ];

    const phase = this.state.heroPhase;
    const phaseIcon = renderIcon(
      phase === 0 ? PHONE_PATH : CHECK_PATHS,
      30,
      1.9,
      phase === 0 ? '#2F8FE0' : 'white'
    );
    const phaseLabel =
      phase === 0
        ? 'Incoming call…'
        : phase === 1
        ? 'Answered by your AI agent'
        : 'Booked into your calendar';

    const ringPulseStyle = phase === 0 ? { animation: 'pulseRing 1.4s ease-out infinite' } : {};
    const chipStyle: React.CSSProperties = {
      opacity: phase === 2 ? 1 : 0,
      transform: `translateY(${phase === 2 ? 0 : 16}px)`,
      transition: 'opacity 0.5s ease, transform 0.5s ease'
    };

    const worksWithData = [
      { label: 'Google Calendar', iconPaths: CALENDAR_PATHS },
      { label: 'Outlook', iconPaths: MAIL_PATHS },
      { label: 'Your CRM', iconPaths: LAYOUT_PATHS }
    ];
    const worksWithOnce = worksWithData.map((w) => ({
      ...w,
      icon: renderIcon(w.iconPaths, 22, 1.75, 'currentColor')
    }));
    const worksWithLogos = [...worksWithOnce, ...worksWithOnce];

    const channelsData = [
      { name: 'Your business line', detail: 'Answers on the number you already have', iconPaths: PHONE_PATH },
      { name: 'Text messages', detail: 'Confirmations and reminders, sent as texts', iconPaths: MESSAGE_PATHS },
      { name: 'Google Calendar', detail: 'Books straight into the calendar you use daily', iconPaths: CALENDAR_PATHS },
      { name: 'Outlook', detail: 'Works the same way if that\'s your calendar instead', iconPaths: MAIL_PATHS }
    ];
    const channels = channelsData.map((c, i) => ({
      ...c,
      icon: renderIcon(c.iconPaths, 20, 1.75, '#2F8FE0'),
      ref: this.revealRef('chan-' + i) as React.RefCallback<HTMLDivElement>,
      style: this.revealStyle('chan-' + i, i * 0.08)
    }));

    const stagesData = [
      { num: '01', title: 'Answers the call', detail: 'The clinic\'s own AI agent picks up and understands what the caller needs against that business\'s own hours, services, and pricing.' },
      { num: '02', title: 'Takes the action', detail: 'Books, reschedules, or cancels directly on the clinic\'s calendar after checking real availability — or transfers to a staff member when it\'s something only a person should handle.' },
      { num: '03', title: 'Closes the loop', detail: 'Sends the confirmation text and email, saves the recording and transcript, and updates the CRM — so the owner sees it all later in the portal.' }
    ];

    const stageVisibleCount = stagesData.filter((_, i) => this.state.visible['stage-' + i]).length;
    const stages = stagesData.map((s, i) => {
      const v = !!this.state.visible['stage-' + i];
      return {
        ...s,
        dotBg: v ? '#2F8FE0' : '#E9F2FB',
        dotBorder: v ? '#2F8FE0' : 'rgba(14,27,42,0.15)',
        numColor: v ? 'white' : 'rgba(14,27,42,0.58)',
        ref: this.revealRef('stage-' + i) as React.RefCallback<HTMLDivElement>,
        circleRef: this.stageCircleRef(i),
        style: this.revealStyle('stage-' + i, 0),
        wrapStyle: isMobile
          ? { display: 'flex', alignItems: 'flex-start', gap: '20px', paddingBottom: '36px', position: 'relative' as const }
          : { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', textAlign: 'center' as const, width: '100%', padding: '0 12px' }
      };
    });

    const stageProgressPx = this.state.stageLineSpanPx * (stagesData.length ? stageVisibleCount / stagesData.length : 0);
    const stageProgressVerticalPercent = stageVisibleCount <= 1 ? 0 : ((stageVisibleCount - 1) / (stagesData.length - 1)) * 100;

    const stageContainerStyle: React.CSSProperties = isMobile
      ? { position: 'relative', paddingLeft: '14px' }
      : { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '32px', width: '800px', marginLeft: 'auto', marginRight: 'auto', position: 'relative' };

    const featuresData = [
      { title: 'Your Own AI Agent', detail: 'Trained on your business\'s own hours, services, pricing, and staff — not a shared script. It answers every call, handles common questions, books, reschedules, and cancels, transfers to a real person when needed, and forwards anything urgent.', tooltip: 'The core of MyFrontDesk: one agent, built entirely around how your practice runs.', iconPaths: PHONE_PATH },
      { title: 'Smart Appointment Scheduling', detail: 'Checks real availability and books straight into your own Google Calendar or Outlook, keeping both in sync automatically.', tooltip: 'No double-bookings — it only offers times that are actually open.', iconPaths: CALENDAR_PATHS },
      { title: 'Automated Confirmations & Reminders', detail: 'A text and email confirm every booking, a reminder goes out beforehand, and a follow-up if someone doesn\'t show. No back-and-forth needed.', tooltip: 'All one-way and automatic — nobody on your team has to send these by hand.', iconPaths: MESSAGE_PATHS },
      { title: 'CRM Sync', detail: 'Every call and booking flows straight into whatever CRM or practice-management tool you already use.', tooltip: 'This doesn\'t replace your CRM — it just keeps it updated for you.', iconPaths: REFRESH_PATHS },
      { title: 'Customer Portal', detail: 'Log in to see call recordings, transcripts, and monthly stats for exactly what happened on every call.', tooltip: 'A clear read on call volume and outcomes, whenever you want it.', iconPaths: BARCHART_PATHS }
    ];

    const cardBasis = isMobile ? { flex: '0 0 86%' } : { flex: '0 0 36%' };
    const features = featuresData.map((f, i) => ({
      ...f,
      cardBasis,
      icon: renderIcon(f.iconPaths, 22, 1.75, 'white'),
      cardRef: this.carouselCardRef(i),
      style: this.revealStyle('feat-' + i, i * 0.06),
      onTooltipEnter: this.setTooltip(i),
      tooltipStyle: {
        opacity: this.state.tooltipIdx === i ? 1 : 0,
        pointerEvents: 'none' as const,
        transform: `translateY(${this.state.tooltipIdx === i ? 0 : -6}px)`,
        transition: 'opacity 0.2s ease, transform 0.2s ease'
      }
    }));

    const carouselDots = featuresData.map((f, i) => ({
      onClick: this.carouselDotClick(i),
      label: f.title,
      style: {
        width: this.state.carouselIndex === i ? '22px' : '7px',
        background: this.state.carouselIndex === i ? '#2F8FE0' : 'rgba(14,27,42,0.18)',
        borderRadius: '3px',
        transition: 'width 0.3s ease, background 0.3s ease'
      }
    }));

    const preventSubmit = (e: React.FormEvent) => e.preventDefault();

    return (
      <div style={{ position: 'relative', isolation: 'isolate', fontFamily: "'Figtree', sans-serif", color: '#0E1B2A', overflowX: 'hidden' }}>
        
        {/* Ambient Background: single shared layer behind all sections */}
        <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: '#E9F2FB', overflow: 'hidden', pointerEvents: 'none' }}>
          <div className="amb-drift" style={{ position: 'absolute', top: '-10%', left: '-10%', width: '60%', height: '60%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,143,224,0.2), transparent 70%)', filter: 'blur(40px)', animation: 'blobDriftA 26s ease-in-out infinite' }} />
          <div className="amb-drift" style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: '65%', height: '65%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(217,113,75,0.10), transparent 70%)', filter: 'blur(50px)', animation: 'blobDriftB 32s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', inset: 0, opacity: 0.09, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Cpath d='M44 0H0V44' fill='none' stroke='%236b6656' stroke-width='1'/%3E%3C/svg%3E\")", backgroundSize: '44px 44px' }} />

          <svg className="amb-drift" style={{ position: 'absolute', top: '6%', left: '6%', width: '44px', height: '44px', opacity: 0.16, animation: 'ambDrift1 52s linear 0s infinite' }} viewBox="0 0 24 24" fill="none" stroke="#2F8FE0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.6 4.2h3.4l1.3 5-2.5 1.6a12.4 12.4 0 0 0 5.9 5.9l1.6-2.5 5 1.3v3.4a2 2 0 0 1-2.1 2C10.7 20.2 3.8 13.3 3.1 5.9c-.1-1 .7-1.7 1.6-1.7z" /></svg>
          <svg className="amb-drift" style={{ position: 'absolute', top: '16%', left: '84%', width: '50px', height: '50px', opacity: 0.15, animation: 'ambDrift2 61s linear 4s infinite' }} viewBox="0 0 24 24" fill="none" stroke="#2F8FE0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z" /><path d="M4 9.5h16" /><path d="M8.5 2v4" /><path d="M15.5 2v4" /></svg>
          <svg className="amb-drift" style={{ position: 'absolute', top: '38%', left: '10%', width: '40px', height: '40px', opacity: 0.17, animation: 'ambDrift4 68s linear 14s infinite' }} viewBox="0 0 24 24" fill="none" stroke="#2F8FE0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.6 2.6L16 9" /></svg>
          <svg className="amb-drift" style={{ position: 'absolute', top: '48%', left: '70%', width: '42px', height: '42px', opacity: 0.16, animation: 'ambDrift5 55s linear 2s infinite' }} viewBox="0 0 24 24" fill="none" stroke="#2F8FE0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10v4" /><path d="M8 6v12" /><path d="M12 9v6" /><path d="M16 4v16" /><path d="M20 9v6" /></svg>
          <svg className="amb-drift" style={{ position: 'absolute', top: '66%', left: '22%', width: '44px', height: '44px', opacity: 0.17, animation: 'ambDrift7 58s linear 6s infinite' }} viewBox="0 0 24 24" fill="none" stroke="#2F8FE0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          <svg className="amb-drift" style={{ position: 'absolute', top: '78%', left: '80%', width: '40px', height: '40px', opacity: 0.16, animation: 'ambDrift2 49s linear 27s infinite' }} viewBox="0 0 24 24" fill="none" stroke="#2F8FE0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
          <svg className="amb-drift" style={{ position: 'absolute', top: '90%', left: '40%', width: '38px', height: '38px', opacity: 0.17, animation: 'ambDrift3 71s linear 16s infinite' }} viewBox="0 0 24 24" fill="none" stroke="#2F8FE0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4h7l4 4v12H7z" /><path d="M10 11h6" /><path d="M10 15h6" /><path d="M10 7h3" /></svg>
        </div>

        {/* Navbar */}
        <header style={headerStyle}>
          <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/logo.png" alt="MyFrontDesk" style={{ height: '32px', width: '32px', objectFit: 'contain' }} />
              <span style={{ fontFamily: "'Figtree', sans-serif", fontWeight: 600, fontSize: '19px', letterSpacing: '-0.01em' }}>MyFrontDesk</span>
            </div>

            <nav style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: '30px' }}>
              {navLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  onMouseEnter={link.onEnter}
                  onMouseLeave={this.clearHover}
                  style={{ position: 'relative', padding: '8px 0', fontSize: '14.5px', fontWeight: 500, color: 'rgba(14,27,42,0.82)', textDecoration: 'none', display: 'inline-block' }}
                >
                  {link.label}
                  <span style={{ ...link.underlineStyle, position: 'absolute', left: 0, bottom: '2px', height: '2px', background: '#2F8FE0' }} />
                </a>
              ))}
            </nav>

            <div style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center' }}>
              <a href="#final-cta" className="btn-hover-transform" style={{ padding: '11px 22px', borderRadius: '10px', background: '#2F8FE0', color: '#FFFDF8', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap', flexShrink: 0 }}>Request Early Access</a>
            </div>

            <button onClick={this.toggleMobile} style={{ display: isMobile ? 'flex' : 'none', background: 'none', border: 'none', padding: '6px', cursor: 'pointer' }}>
              {renderIcon(MENU_PATHS, 22, 1.75, '#0E1B2A')}
            </button>
          </div>
        </header>

        {this.state.mobileOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(250,246,238,0.97)', backdropFilter: 'blur(16px)', display: isMobile ? 'flex' : 'none', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <img src="/logo.png" alt="MyFrontDesk" style={{ height: '28px', width: '28px', objectFit: 'contain' }} />
                <span style={{ fontFamily: "'Figtree', sans-serif", fontWeight: 600, fontSize: '19px' }}>MyFrontDesk</span>
              </div>
              <button onClick={this.toggleMobile} style={{ background: 'none', border: 'none', padding: '6px', cursor: 'pointer' }}>
                {renderIcon(CLOSE_PATHS, 22, 1.75, '#0E1B2A')}
              </button>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {navLinks.map((link) => (
                <a key={link.key} href={link.href} onClick={this.toggleMobile} style={{ padding: '16px 0', fontSize: '26px', fontWeight: 600, fontFamily: "'Figtree', sans-serif", color: 'rgba(14,27,42,0.92)', textDecoration: 'none' }}>{link.label}</a>
              ))}
              <a href="#final-cta" onClick={this.toggleMobile} style={{ marginTop: '24px', padding: '16px 34px', borderRadius: '12px', background: '#2F8FE0', color: '#FFFDF8', fontSize: '16px', fontWeight: 600, textDecoration: 'none' }}>Request Early Access</a>
            </div>
          </div>
        )}

        {/* Hero + FeatureGrid pin/reveal */}
        <div ref={this.pinWrapRef} style={{ position: 'relative' }}>
          {/* Hero */}
          <section ref={this.heroSectionRef} style={{ ...heroPinStyle, maxWidth: '1240px', margin: '0 auto', padding: '56px 32px 56px', display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : '1.05fr 0.95fr', gap: isMobile ? '40px' : '64px', alignItems: 'center' }}>
            <div ref={this.revealRef('hero-text') as React.RefCallback<HTMLDivElement>} style={this.revealStyle('hero-text', 0)}>
              <h1 style={{ fontFamily: "'Figtree', sans-serif", letterSpacing: '-0.025em', margin: '0 0 14px' }}>
                <div style={{ lineHeight: 0.98 }}>
                  {headlineWords.map((w, i) => (
                    <span key={i} style={w.style}>{w.text}</span>
                  ))}
                </div>
                <div style={{ lineHeight: 1.05, marginTop: '2px' }}>
                  {headlineWordsLine2.map((w, i) => (
                    <span key={i} style={w.style}>{w.text}</span>
                  ))}
                </div>
              </h1>
              <p style={{ fontSize: '18px', lineHeight: 1.6, color: 'rgba(14,27,42,0.72)', maxWidth: '460px', margin: '0 0 30px' }}>
                An agent trained on your business's own hours, services, and calendar answers the call, books the appointment, and lets you review exactly what happened afterward.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap', marginBottom: '32px' }}>
                <a href="#final-cta" className="btn-hover-transform" style={{ padding: '14px 28px', borderRadius: '12px', background: '#2F8FE0', color: '#FFFDF8', fontSize: '15px', fontWeight: 600, textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap', flexShrink: 0 }}>Request Early Access</a>
                
                <button
                  onClick={isCallActive ? this.stopCall : this.startCall}
                  disabled={isLoading || this.state.callState === 'ending'}
                  className="btn-hover-transform"
                  style={{
                    padding: '14px 28px',
                    borderRadius: '12px',
                    background: isCallActive ? '#EF4444' : 'rgba(47,143,224,0.1)',
                    border: isCallActive ? '1px solid #EF4444' : '1px solid rgba(47,143,224,0.3)',
                    color: isCallActive ? '#FFFDF8' : '#2F8FE0',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: (isLoading || this.state.callState === 'ending') ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.25s ease'
                  }}
                >
                  {isCallActive ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.8 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-5.33-5.33A19.79 19.79 0 0 1 2 4.18 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .8 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" style={{ transform: 'rotate(135deg)', transformOrigin: 'center' }} />
                    </svg>
                  ) : (
                    renderIcon(PHONE_PATH, 16, 1.9, '#2F8FE0')
                  )}
                  {isCallActive && 'End Call'}
                  {isLoading && 'Connecting...'}
                  {(this.state.callState === 'idle' || this.state.callState === 'error') && 'Talk to Agent'}
                  {this.state.callState === 'ended' && 'Call Ended'}
                </button>

                <a href="#how-it-works" style={{ fontSize: '14.5px', fontWeight: 600, color: '#2F8FE0', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>See a call become a booking ↓</a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {capabilities.map((cap, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    {renderIcon(CHECK_PATHS, 16, 2, '#2F8FE0')}
                    <span style={{ fontSize: '14.5px', lineHeight: 1.5, color: 'rgba(14,27,42,0.78)' }}>{cap}</span>
                  </div>
                ))}
              </div>
            </div>

            <div ref={this.revealRef('hero-visual') as React.RefCallback<HTMLDivElement>} style={this.revealStyle('hero-visual', 0.15)}>
              <VoiceAgentWidget
                ref={this.widgetRef}
                onCallStateChange={(callState) => {
                  this.setState({ callState });
                  if (callState === 'connected') {
                    this.pauseHeroInterval();
                  } else if (callState === 'idle' || callState === 'ended' || callState === 'error') {
                    this.resumeHeroInterval();
                  }
                }}
              />
            </div>
          </section>

          {/* Works With: compatibility marquee */}
          <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 32px' }}>
            <div style={{ height: '1px', background: 'rgba(14,27,42,0.1)' }} />
            <div style={{ padding: '26px 0', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(217,113,75,0.85)', marginBottom: '20px' }}>Works with what you already use</div>
              <div style={{ overflow: 'hidden', WebkitMaskImage: 'linear-gradient(90deg,transparent,black 8%,black 92%,transparent)', maskImage: 'linear-gradient(90deg,transparent,black 8%,black 92%,transparent)' }}>
                <div style={{ display: 'flex', width: 'max-content', gap: '64px', animation: 'marqueeScroll 24s linear infinite' }}>
                  {worksWithLogos.map((wl, i) => (
                    <div key={wl.label + '-' + i} className="logo-marquee-item" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, transition: 'color 0.25s ease' }}>
                      {wl.icon}
                      <span style={{ fontSize: '15px', fontWeight: 600, whiteSpace: 'nowrap' }}>{wl.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ height: '1px', background: 'rgba(14,27,42,0.1)' }} />
          </section>

          {/* Feature Grid */}
          <section id="features" style={{ ...featPinStyle, maxWidth: '1240px', margin: '0 auto', padding: '80px 32px 56px' }}>
            <div ref={this.revealRef('feat-head') as React.RefCallback<HTMLDivElement>} style={{ ...this.revealStyle('feat-head', 0), maxWidth: '600px', margin: '0 auto 40px', textAlign: 'center' }}>
              <h2 style={{ fontFamily: "'Figtree', sans-serif", fontSize: 'clamp(26px,3vw,34px)', fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 12px' }}>Everything your front desk needs. Nothing it doesn't.</h2>
              <p style={{ fontSize: '16px', color: 'rgba(14,27,42,0.65)', margin: 0 }}>Five things, done thoroughly, instead of a hundred things done halfway.</p>
            </div>

            <div
              ref={this.carouselRef}
              className="mfd-carousel-scroll"
              onScroll={this.onCarouselScroll}
              onPointerDown={this.onCarouselPointerDown}
              onPointerMove={this.onCarouselPointerMove}
              onPointerUp={this.onCarouselPointerUp}
              onPointerLeave={this.onCarouselPointerUp}
              onMouseEnter={this.onCarouselMouseEnter}
              onMouseLeave={this.onCarouselMouseLeave}
              style={{ display: 'flex', gap: '20px', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', cursor: 'grab', padding: '4px 4px 12px', userSelect: 'none' }}
            >
              {features.map((feat, i) => (
                <div key={i} ref={feat.cardRef} className="feature-card-hover" style={{ ...feat.style, ...feat.cardBasis, scrollSnapAlign: 'start', padding: '28px', borderRadius: '20px', background: 'rgba(251,253,255,0.9)', border: '1px solid rgba(14,27,42,0.12)', boxShadow: '0 1px 2px rgba(14,27,42,0.05), 0 20px 40px -22px rgba(14,27,42,0.16)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    <div onMouseEnter={feat.onTooltipEnter} onMouseLeave={this.clearTooltip} style={{ width: '46px', height: '46px', borderRadius: '13px', background: '#2F8FE0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px', cursor: 'default' }}>{feat.icon}</div>
                    <div style={{ ...feat.tooltipStyle, position: 'absolute', top: '54px', left: 0, zIndex: 5, width: '220px', padding: '10px 12px', borderRadius: '10px', background: '#0E1B2A', color: '#FFFDF8', fontSize: '12.5px', lineHeight: 1.5 }}>{feat.tooltip}</div>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: "'Figtree', sans-serif", marginBottom: '8px' }}>{feat.title}</div>
                  <div style={{ fontSize: '14.5px', lineHeight: 1.6, color: 'rgba(14,27,42,0.65)' }}>{feat.detail}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
              {carouselDots.map((dot, i) => (
                <button key={i} onClick={dot.onClick} aria-label={dot.label} style={{ ...dot.style, height: '6px', border: 'none', padding: 0, cursor: 'pointer' }} />
              ))}
            </div>
          </section>
        </div>

        {/* Communication Channels */}
        <section id="channels" style={{ maxWidth: '1240px', margin: '0 auto', padding: '40px 32px' }}>
          <div ref={this.revealRef('channels-head') as React.RefCallback<HTMLDivElement>} style={{ ...this.revealStyle('channels-head', 0), maxWidth: '560px', margin: '0 auto 44px', textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Figtree', sans-serif", fontSize: 'clamp(26px,3vw,34px)', fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 12px' }}>Works right alongside what you already use</h2>
            <p style={{ fontSize: '16px', color: 'rgba(14,27,42,0.65)', margin: 0 }}>No new accounts, no new devices. It plugs into your existing phone line, calendar, and texts.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '16px' }}>
            {channels.map((ch, i) => (
              <div key={i} ref={ch.ref} style={{ ...ch.style, display: 'flex', alignItems: 'center', gap: '14px', padding: '20px', borderRadius: '16px', background: 'rgba(251,253,255,0.88)', border: '1px solid rgba(14,27,42,0.12)', boxShadow: '0 1px 2px rgba(14,27,42,0.05), 0 16px 32px -22px rgba(14,27,42,0.16)' }}>
                <div style={{ width: '42px', height: '42px', flexShrink: 0, borderRadius: '11px', background: 'rgba(47,143,224,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ch.icon}</div>
                <div>
                  <div style={{ fontSize: '14.5px', fontWeight: 600 }}>{ch.name}</div>
                  <div style={{ fontSize: '12.5px', color: 'rgba(14,27,42,0.58)' }}>{ch.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works: three-stage flow */}
        <section id="how-it-works" style={{ maxWidth: '1100px', margin: '0 auto', padding: '56px 32px 64px' }}>
          <div ref={this.revealRef('how-head') as React.RefCallback<HTMLDivElement>} style={{ ...this.revealStyle('how-head', 0), maxWidth: '560px', margin: '0 auto 56px', textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Figtree', sans-serif", fontSize: 'clamp(26px,3vw,34px)', fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 12px' }}>What happens on a real call</h2>
            <p style={{ fontSize: '16px', color: 'rgba(14,27,42,0.65)', margin: 0 }}>An administrative front desk, start to finish — no clinical decisions, just the calendar and paperwork handled.</p>
          </div>

          <div style={{ position: 'relative' }} ref={this.stageWrapRef}>
            <div style={{ display: isMobile ? 'none' : 'block', position: 'absolute', top: `${this.state.stageLineTopPx}px`, left: `${this.state.stageLineLeftPx}px`, width: `${this.state.stageLineSpanPx}px`, height: '2px', background: 'rgba(14,27,42,0.12)' }} />
            <div style={{ display: isMobile ? 'none' : 'block', position: 'absolute', top: `${this.state.stageLineTopPx}px`, left: `${this.state.stageLineLeftPx}px`, width: `${stageProgressPx}px`, height: '2px', background: '#2F8FE0', transition: 'width 0.8s ease' }} />
            
            <div style={{ display: isMobile ? 'block' : 'none', position: 'absolute', left: '33px', top: '34px', bottom: '34px', width: '2px', background: 'rgba(14,27,42,0.12)' }} />
            <div style={{ display: isMobile ? 'block' : 'none', position: 'absolute', left: '33px', top: '34px', width: '2px', background: '#2F8FE0', height: `${stageProgressVerticalPercent}%`, transition: 'height 0.8s ease' }} />

            <div style={stageContainerStyle}>
              {stages.map((stage, i) => (
                <div key={i} ref={stage.ref} style={{ ...stage.style, ...stage.wrapStyle }}>
                  <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: stage.dotBg, border: `2px solid ${stage.dotBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.4s ease, border-color 0.4s ease', position: 'relative', zIndex: 2 }} ref={stage.circleRef}>
                    <span style={{ fontFamily: "'Figtree', sans-serif", fontSize: '20px', fontWeight: 700, color: stage.numColor }}>{stage.num}</span>
                  </div>
                  {isMobile ? (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '19px', fontWeight: 600, fontFamily: "'Figtree', sans-serif", margin: '0 0 8px' }}>{stage.title}</div>
                      <div style={{ fontSize: '14.5px', color: 'rgba(14,27,42,0.65)', lineHeight: 1.6, maxWidth: '280px' }}>{stage.detail}</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '19px', fontWeight: 600, fontFamily: "'Figtree', sans-serif", margin: '16px 0 8px' }}>{stage.title}</div>
                      <div style={{ fontSize: '14.5px', color: 'rgba(14,27,42,0.65)', lineHeight: 1.6, maxWidth: '280px' }}>{stage.detail}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section id="final-cta" style={{ maxWidth: '900px', margin: '0 auto', padding: '70px 32px 110px' }}>
          <div ref={this.revealRef('cta') as React.RefCallback<HTMLDivElement>} style={{ ...this.revealStyle('cta', 0), textAlign: 'center', padding: isMobile ? '48px 24px' : '64px 40px', borderRadius: '28px', background: '#0E1B2A', color: '#FFFDF8' }}>
            <h2 style={{ fontFamily: "'Figtree', sans-serif", fontSize: 'clamp(28px,3.4vw,38px)', fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 16px' }}>Be one of the first clinics on MyFrontDesk</h2>
            <p style={{ fontSize: '16.5px', color: 'rgba(251,253,255,0.72)', maxWidth: '460px', margin: '0 auto 32px' }}>We&apos;re onboarding a small group of practices before opening this up more broadly. Leave your email and we&apos;ll reach out.</p>
            <form onSubmit={preventSubmit} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'rgba(251,253,255,0.08)', border: '1px solid rgba(251,253,255,0.18)', borderRadius: '12px', padding: '6px', maxWidth: '420px', width: '100%', flexDirection: isMobile ? 'column' : 'row' }}>
              <input type="email" placeholder="you@yourclinic.com" required style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: '#FFFDF8', fontSize: '14.5px', padding: '10px 12px', outline: 'none', fontFamily: "'Figtree', sans-serif", width: isMobile ? '100%' : 'auto' }} />
              <button type="submit" className="btn-cta-hover-transform" style={{ padding: '11px 22px', borderRadius: '9px', background: '#2F8FE0', color: '#FFFDF8', fontSize: '14.5px', fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', width: isMobile ? '100%' : 'auto' }}>Request Early Access</button>
            </form>
          </div>
        </section>

        {/* Footer */}
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 32px' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, rgba(47,143,224,0.15), transparent)' }} />
        </div>
        <footer style={{ position: 'relative', maxWidth: '1240px', margin: '0 auto', padding: '48px 32px 40px', display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : '1.4fr 1fr 1fr', gap: '32px', overflow: 'hidden' }}>
          <svg style={{ position: 'absolute', bottom: '24px', right: '32px', width: '64px', height: '64px', opacity: 0.06, pointerEvents: 'none' }} viewBox="0 0 24 24" fill="none" stroke="#2F8FE0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.6 2.6L16 9" /></svg>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <img src="/logo.png" alt="MyFrontDesk" style={{ height: '36px', width: '36px', objectFit: 'contain' }} />
              <span style={{ fontFamily: "'Figtree', sans-serif", fontWeight: 700, fontSize: '26px', letterSpacing: '-0.02em' }}>MyFrontDesk</span>
            </div>
            <p style={{ fontSize: '13.5px', color: 'rgba(14,27,42,0.85)', lineHeight: 1.6, maxWidth: '280px', margin: 0 }}>A dedicated front-desk agent for clinics and appointment-based practices — it answers, books, and keeps everyone in the loop.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'rgba(217,113,75,0.7)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>Product</span>
            {navLinksData.map((fl, i) => (
              <a key={i} href={fl.href} className="footer-link-hover" style={{ fontSize: '13.5px', color: '#0E1B2A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {fl.label}
                <span className="footer-arrow" style={{ opacity: 0, transition: 'opacity 0.2s ease' }}>→</span>
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'rgba(217,113,75,0.7)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>Company</span>
            <a href="#final-cta" className="footer-link-hover" style={{ fontSize: '13.5px', color: '#0E1B2A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Request Early Access
              <span className="footer-arrow" style={{ opacity: 0, transition: 'opacity 0.2s ease' }}>→</span>
            </a>
          </div>
        </footer>
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 32px 32px' }}>
          <span style={{ fontSize: '12.5px', color: 'rgba(14,27,42,0.7)' }}>© 2026 MyFrontDesk</span>
        </div>

        {/* Floating Voice Agent Widget */}
        <FloatingVoiceWidget />

      </div>
    );
  }
}
