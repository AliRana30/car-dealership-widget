// ============================================================
// VoiceWidget — Client Configuration: Healthcare / Clinic
// ============================================================
// Designed for a medical clinic or healthcare provider website.
// Calm greens, trustworthy tones, clean layout, voice-first.
// ============================================================
// SECURITY: Never include API keys or server secrets here.
// ============================================================

import { ClientVoiceWidgetConfig } from '../types';

const clinicAConfig: ClientVoiceWidgetConfig = {
  provider: {
    provider: 'retell',
    agentId: 'agent_3150b4da2eaf98174c827f061d',
  },
  branding: {
    companyName: 'CarePoint Clinic',
    assistantName: 'CarePoint Reception',
    title: 'Speak to CarePoint Reception',
    subtitle: 'Book appointments, ask about services, or get directions — instantly.',
    welcomeMessage:
      "Hello! You've reached CarePoint Clinic's AI receptionist. I can help you book an appointment or answer general questions. How can I assist you today?",
    startLabel: 'Start Conversation',
    connectingLabel: 'Connecting to reception...',
    connectedLabel: "You're connected to CarePoint",
    endLabel: 'End Call',
    retryLabel: 'Retry Connection',
    muteLabel: 'Mute microphone',
    unmuteLabel: 'Unmute microphone',
    errorMessage: 'We\'re having trouble connecting. Please try again or call us directly.',
    callEndedMessage: 'Thank you for contacting CarePoint Clinic. Have a healthy day!',
    placeholderText: 'Type your question...',
    agentMessageName: 'CarePoint',
    userMessageName: 'You',
  },

  avatar: {
    enabled: true,
    // Replace with actual clinic avatar/logo image
    src: '/images/carepoint-avatar.png',
    fallbackText: 'CP',
    size: 44,
    shape: 'circle',
  },

  theme: {
    // Calm, trustworthy medical green
    primaryColor: '#059669',
    primaryHoverColor: '#047857',
    primaryActiveColor: '#065f46',
    launcherBackground: '#059669',

    // Clean, clinical whites
    panelBackground: '#FAFFFE',
    headerBackground: '#F0FDF8',
    transcriptBackground: 'transparent',
    userMessageBackground: '#D1FAE5',
    agentMessageBackground: 'rgba(5, 150, 105, 0.06)',

    primaryTextColor: '#064e3b',
    secondaryTextColor: 'rgba(6, 78, 59, 0.82)',
    mutedTextColor: 'rgba(6, 78, 59, 0.55)',

    borderColor: 'rgba(5, 150, 105, 0.15)',
    inputBorderColor: 'rgba(5, 150, 105, 0.25)',

    successColor: '#059669',
    errorColor: '#DC2626',
    warningColor: '#D97706',
    connectingColor: '#059669',
    waveformColor: '#059669',
    speakingIndicatorColor: '#059669',

    radius: 'xl',
    shadow: 'lg',
    density: 'comfortable',
  },

  typography: {
    // Professional, clean medical font
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    headingWeight: 600,
    bodyWeight: 400,
    fontSizeScale: 'md',
    lineHeight: '1.6',
  },

  launcher: {
    variant: 'icon-label',
    icon: 'headset',
    iconSize: 22,
    iconColor: '#FFFFFF',
    position: 'bottom-right',
    offset: { bottom: 24, right: 24 },
    size: 'large',
    shape: 'pill',
    shadow: 'strong',
    border: { enabled: true, width: 2, color: 'rgba(255,255,255,0.3)' },
    label: {
      show: true,
      text: 'Book Appointment',
      position: 'left',
    },
    zIndex: 1000,
    pulseAnimation: true,
    tooltip: 'Talk to CarePoint Reception',
    ariaLabel: 'Open CarePoint clinic receptionist',
  },

  panel: {
    width: 380,
    maxWidth: '100vw',
    maxHeight: 540,
    position: 'bottom-right',
    offset: { bottom: 96, right: 24 },
    showHeader: true,
    showCloseButton: true,
    showTabs: false, // Voice-only for healthcare (no text chat)
  },

  audioVisualizer: {
    type: 'orb',
    enabled: true,
    color: '#059669',
    intensity: 0.85,
    size: 90,
    animationSpeed: 0.9,
  },

  behavior: {
    showTranscript: true,
    showMuteButton: true,
    showEndButton: true,
    showAgentStatus: true,
    showDuration: true,
    showWaveform: true,
    allowTextChat: false, // Voice-first clinic experience
    allowVoiceChat: true,
    defaultTab: 'voice',
    autoResetEndedTimeout: 8000,
    connectionTimeout: 20000,
    telemetryEnabled: false, // Disabled for healthcare privacy
  },

  animation: {
    launcher: 'pulse',
    panel: 'slide-up',
    speaking: 'pulse',
    duration: 300,
  },

  responsive: {
    mobileBreakpoint: 768,
    fullscreenOnMobile: true,
    mobile: {
      launcherSize: 'large',
      bottomOffset: 20,
      horizontalOffset: 16,
      panelWidth: 'calc(100vw - 24px)',
      panelMaxHeight: '85vh',
    },
  },
};

export default clinicAConfig;
