// ============================================================
// VoiceWidget — New Client Configuration Template
// ============================================================
//
// HOW TO USE THIS TEMPLATE:
//
// 1. Copy this file to:
//    src/config/voiceWidget/clients/yourClientName.ts
//
// 2. Find & replace "NewClient" with your client name.
//
// 3. Fill in branding, colors, and launcher settings.
//
// 4. Register the config in:
//    src/config/voiceWidget/registry.ts
//    e.g. 'your-client-id': newClientConfig
//
// 5. Use in your page:
//    const config = getVoiceWidgetConfig('your-client-id');
//    <VoiceAgentWidget config={config} />
//
// ============================================================
// SECURITY: NEVER include API keys, auth tokens, Twilio
// credentials, or any server secrets in this file.
// ============================================================

import { ClientVoiceWidgetConfig } from '../types';

const newClientConfig: ClientVoiceWidgetConfig = {
  // ----------------------------------------------------------
  // PROVIDER — agent service identity
  // ----------------------------------------------------------
  provider: {
    provider: 'retell',           // 'retell' | 'vapi'
    agentId: '',                  // Vapi Assistant ID or Retell Agent ID
  },

  // ----------------------------------------------------------
  // BRANDING — labels, names, copy
  // ----------------------------------------------------------
  branding: {
    companyName: 'New Client Name',       // e.g. "Acme Corp"
    assistantName: 'AI Assistant',         // e.g. "Acme AI"
    title: 'Talk to our AI',               // Panel heading
    subtitle: 'Ask anything, instantly.',  // Panel sub-heading
    welcomeMessage:
      "Hi! I'm the AI assistant for New Client. How can I help you today?",
    startLabel: 'Start Conversation',
    connectingLabel: 'Connecting...',
    connectedLabel: "You're connected",
    endLabel: 'End Call',
    retryLabel: 'Try Again',
    muteLabel: 'Mute',
    unmuteLabel: 'Unmute',
    errorMessage: 'Unable to connect. Please try again.',
    callEndedMessage: 'Call ended. Thank you!',
    placeholderText: 'Type a message...',
    agentMessageName: 'Agent',
    userMessageName: 'You',
  },

  // ----------------------------------------------------------
  // AVATAR — assistant identity image (optional)
  // ----------------------------------------------------------
  avatar: {
    enabled: false,               // Set true to show an avatar image
    src: '/images/avatar.png',    // Path or URL to avatar image
    fallbackText: 'AI',           // Shows if image fails to load
    size: 44,                     // Pixel size
    shape: 'circle',              // 'circle' | 'rounded' | 'square'
  },

  // ----------------------------------------------------------
  // THEME — colors, radius, shadow
  // ----------------------------------------------------------
  theme: {
    // Primary color (buttons, accents, highlights)
    primaryColor: '#2563EB',          // Change to client's brand color
    primaryHoverColor: '#1d4ed8',
    primaryActiveColor: '#1e40af',
    launcherBackground: '#2563EB',

    // Panel surfaces
    panelBackground: '#FFFFFF',
    headerBackground: '#FFFFFF',
    transcriptBackground: 'transparent',
    userMessageBackground: '#EFF6FF',
    agentMessageBackground: 'rgba(37, 99, 235, 0.06)',

    // Text
    primaryTextColor: '#0f172a',
    secondaryTextColor: 'rgba(15, 23, 42, 0.75)',
    mutedTextColor: 'rgba(15, 23, 42, 0.5)',

    // Borders
    borderColor: 'rgba(15, 23, 42, 0.12)',
    inputBorderColor: 'rgba(37, 99, 235, 0.3)',

    // Status colors
    successColor: '#22C55E',
    errorColor: '#EF4444',
    warningColor: '#F59E0B',
    connectingColor: '#2563EB',
    waveformColor: '#2563EB',
    speakingIndicatorColor: '#2563EB',

    // Shape
    radius: 'lg',          // 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
    shadow: 'xl',          // 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    density: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
  },

  // ----------------------------------------------------------
  // TYPOGRAPHY — scoped inside widget only
  // NOTE: This does NOT modify global body/html font styles.
  // ----------------------------------------------------------
  typography: {
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    headingWeight: 600,
    bodyWeight: 400,
    fontSizeScale: 'md',  // 'sm' | 'md' | 'lg'
    lineHeight: '1.5',
  },

  // ----------------------------------------------------------
  // LAUNCHER BUTTON
  // ----------------------------------------------------------
  launcher: {
    // Layout variant:
    //   'icon'       → round/square button with icon only
    //   'icon-label' → icon + text label side-by-side
    //   'pill'       → text-only pill
    variant: 'icon',

    // Icon to show inside the launcher:
    //   'phone' | 'microphone' | 'headset' | 'message' |
    //   'chat' | 'sparkles' | 'custom'
    icon: 'phone',
    iconSize: 24,
    iconColor: '#FFFFFF',

    // Position on screen
    position: 'bottom-right',  // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    offset: {
      bottom: 24,
      right: 24,
    },

    // Size: 'small' | 'medium' | 'large' | number (px)
    size: 'medium',

    // Shape: 'circle' | 'rounded' | 'square' | 'pill'
    shape: 'circle',

    // Shadow: 'none' | 'subtle' | 'medium' | 'strong'
    shadow: 'medium',

    border: {
      enabled: false,
      width: 1,
      color: 'rgba(255,255,255,0.3)',
    },

    // Text label (used when variant is 'icon-label' or 'pill')
    label: {
      show: false,
      text: 'Talk to AI',
      position: 'left', // 'left' | 'right' | 'above' | 'below'
    },

    // z-index — increase if host site has sticky nav/modals
    zIndex: 1000,

    pulseAnimation: true,
    tooltip: 'Talk to AI Agent',
    ariaLabel: 'Open AI assistant',
  },

  // ----------------------------------------------------------
  // PANEL
  // ----------------------------------------------------------
  panel: {
    width: 360,
    maxWidth: '100vw',
    maxHeight: 480,
    position: 'bottom-right',
    offset: { bottom: 96, right: 24 },
    showHeader: true,
    showCloseButton: true,
    showTabs: true,  // Set false to hide Voice/Text tabs
  },

  // ----------------------------------------------------------
  // AUDIO VISUALIZER
  // ----------------------------------------------------------
  audioVisualizer: {
    // type: 'none' | 'pulse' | 'waveform' | 'bars' | 'orb'
    type: 'waveform',
    enabled: true,
    color: '#2563EB',
    intensity: 1,
    size: 100,
    animationSpeed: 1,
  },

  // ----------------------------------------------------------
  // BEHAVIOR TOGGLES
  // ----------------------------------------------------------
  behavior: {
    showTranscript: true,
    showMuteButton: true,
    showEndButton: true,
    showAgentStatus: true,
    showDuration: true,
    showWaveform: true,
    allowTextChat: true,
    allowVoiceChat: true,
    defaultTab: 'voice',          // 'voice' | 'text'
    autoResetEndedTimeout: 5000,  // ms before auto-reset to idle
    connectionTimeout: 15000,     // ms before marking as failed
    telemetryEnabled: true,
  },

  // ----------------------------------------------------------
  // ANIMATIONS
  // ----------------------------------------------------------
  animation: {
    // Type: 'none' | 'fade' | 'scale' | 'slide' |
    //       'slide-up' | 'slide-down' | 'zoom' | 'pulse'
    launcher: 'pulse',
    panel: 'slide-up',
    speaking: 'pulse',
    duration: 250, // ms
  },

  // ----------------------------------------------------------
  // RESPONSIVE
  // ----------------------------------------------------------
  responsive: {
    mobileBreakpoint: 860,        // px — below this, mobile overrides apply
    fullscreenOnMobile: false,
    mobile: {
      launcherSize: 'medium',
      bottomOffset: 16,
      horizontalOffset: 16,
      panelWidth: 'calc(100vw - 32px)',
      panelMaxHeight: '80vh',
    },
  },
};

export default newClientConfig;
