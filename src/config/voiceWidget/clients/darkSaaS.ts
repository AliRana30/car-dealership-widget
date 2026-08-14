// ============================================================
// VoiceWidget — Client Configuration: Dark Modern SaaS
// ============================================================
// Designed for a modern SaaS product or tech startup.
// Dark panel, electric accent, minimal chrome, text-friendly.
// ============================================================
// SECURITY: Never include API keys or server secrets here.
// ============================================================

import { ClientVoiceWidgetConfig } from '../types';

const darkSaaSConfig: ClientVoiceWidgetConfig = {
  provider: {
    provider: 'retell',
    agentId: 'agent_3150b4da2eaf98174c827f061d',
  },
  branding: {
    companyName: 'NovaTech',
    assistantName: 'Nova AI',
    title: 'Talk to Nova',
    subtitle: 'Your AI product assistant — ask anything about features, pricing, or onboarding.',
    welcomeMessage:
      "Hey! I'm Nova, your AI assistant. Ask me anything about NovaTech — pricing, features, or getting started.",
    startLabel: 'Start talking',
    connectingLabel: 'Starting session...',
    connectedLabel: 'Nova is listening',
    endLabel: 'End session',
    retryLabel: 'Try again',
    muteLabel: 'Mute',
    unmuteLabel: 'Unmute',
    errorMessage: "Couldn't connect. Please check your mic and try again.",
    callEndedMessage: "Session ended. Come back anytime!",
    placeholderText: 'Ask Nova anything...',
    agentMessageName: 'Nova',
    userMessageName: 'You',
  },

  avatar: {
    enabled: true,
    src: '/images/nova-avatar.png',
    fallbackText: 'N',
    size: 40,
    shape: 'rounded',
  },

  theme: {
    // Electric indigo / violet accent
    primaryColor: '#6366F1',
    primaryHoverColor: '#4f46e5',
    primaryActiveColor: '#3730a3',
    launcherBackground: '#6366F1',

    // Dark panel surfaces
    panelBackground: '#0f172a',
    headerBackground: '#1e293b',
    transcriptBackground: 'transparent',
    userMessageBackground: 'rgba(99, 102, 241, 0.18)',
    agentMessageBackground: 'rgba(255, 255, 255, 0.06)',

    primaryTextColor: '#f1f5f9',
    secondaryTextColor: 'rgba(241, 245, 249, 0.78)',
    mutedTextColor: 'rgba(241, 245, 249, 0.45)',

    borderColor: 'rgba(255, 255, 255, 0.08)',
    inputBorderColor: 'rgba(99, 102, 241, 0.4)',

    successColor: '#34D399',
    errorColor: '#F87171',
    warningColor: '#FBBF24',
    connectingColor: '#6366F1',
    waveformColor: '#818CF8',
    speakingIndicatorColor: '#818CF8',

    radius: '2xl',
    shadow: '2xl',
    density: 'compact',
  },

  typography: {
    fontFamily: "'DM Sans', 'Inter', sans-serif",
    headingWeight: 700,
    bodyWeight: 400,
    fontSizeScale: 'sm',
    lineHeight: '1.5',
  },

  launcher: {
    variant: 'icon',
    icon: 'sparkles',
    iconSize: 22,
    iconColor: '#FFFFFF',
    position: 'bottom-right',
    offset: { bottom: 28, right: 28 },
    size: 56, // px — exact size override
    shape: 'rounded',
    shadow: 'strong',
    border: { enabled: true, width: 1, color: 'rgba(99,102,241,0.5)' },
    label: {
      show: false,
      text: 'Ask Nova',
      position: 'left',
    },
    zIndex: 1200, // Higher to clear SaaS app chrome
    pulseAnimation: true,
    tooltip: 'Talk to Nova AI',
    ariaLabel: 'Open Nova AI assistant',
  },

  panel: {
    width: 400,
    maxWidth: '100vw',
    maxHeight: 580,
    position: 'bottom-right',
    offset: { bottom: 100, right: 28 },
    showHeader: true,
    showCloseButton: true,
    showTabs: true,
  },

  audioVisualizer: {
    type: 'bars',
    enabled: true,
    color: '#818CF8',
    intensity: 1.2,
    size: 80,
    animationSpeed: 1.3,
  },

  behavior: {
    showTranscript: true,
    showMuteButton: true,
    showEndButton: true,
    showAgentStatus: true,
    showDuration: false, // Clean minimal UI — no timer
    showWaveform: true,
    allowTextChat: true,
    allowVoiceChat: true,
    defaultTab: 'voice',
    autoResetEndedTimeout: 4000,
    connectionTimeout: 15000,
    telemetryEnabled: true,
  },

  animation: {
    launcher: 'pulse',
    panel: 'scale',
    speaking: 'pulse',
    duration: 200, // Fast and snappy
  },

  responsive: {
    mobileBreakpoint: 768,
    fullscreenOnMobile: false, // Overlay panel, not fullscreen
    mobile: {
      launcherSize: 'medium',
      bottomOffset: 20,
      horizontalOffset: 16,
      panelWidth: 'calc(100vw - 32px)',
      panelMaxHeight: '80vh',
    },
  },
};

export default darkSaaSConfig;
