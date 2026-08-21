// ============================================================
// VoiceWidget — Default Configuration + Utilities
// ============================================================
// SECURITY: This file must NEVER contain API keys, auth tokens,
// Twilio credentials, or any server-side secrets.
// ============================================================

import { VoiceWidgetConfig, ClientVoiceWidgetConfig } from './types';

// -------------------------------------------------------
// Default configuration — the base for all deployments
// -------------------------------------------------------
export const defaultVoiceWidgetConfig: VoiceWidgetConfig = {
  mode: 'floating',

  // Provider + agent. agentId='' means the server falls back to RETELL_AGENT_ID / VAPI_ASSISTANT_ID env vars.
  provider: {
    provider: 'retell',
    agentId: '',
  },


  branding: {
    companyName: 'MyFrontDesk',
    assistantName: 'AI Front Desk Agent',
    title: 'Talk to our AI Agent',
    subtitle: 'Experience the virtual front desk receptionist live in your browser.',
    welcomeMessage: 'Hi! I\'m your AI front desk receptionist. How can I help you today?',
    startLabel: 'Start Conversation',
    connectingLabel: 'Connecting...',
    connectedLabel: "You're connected",
    endLabel: 'End Call',
    retryLabel: 'Try Again',
    muteLabel: 'Mute',
    unmuteLabel: 'Unmute',
    errorMessage: 'Unable to connect. Please check your connection and try again.',
    callEndedMessage: 'The call has ended. Thank you!',
    placeholderText: 'Type your message...',
    agentMessageName: 'Agent',
    userMessageName: 'You',
  },

  avatar: {
    enabled: false,
    src: undefined,
    fallbackText: undefined,
    size: 44,
    shape: 'circle',
  },

  theme: {
    primaryColor: '#2F8FE0',
    primaryHoverColor: '#1d7ccf',
    primaryActiveColor: '#155d9d',
    launcherBackground: '#2F8FE0',
    panelBackground: '#FFFFFF',
    headerBackground: '#FFFFFF',
    transcriptBackground: 'transparent',
    userMessageBackground: '#E9F2FB',
    agentMessageBackground: 'rgba(14, 27, 42, 0.05)',
    primaryTextColor: '#0E1B2A',
    secondaryTextColor: 'rgba(14, 27, 42, 0.8)',
    mutedTextColor: 'rgba(14, 27, 42, 0.58)',
    borderColor: 'rgba(14, 27, 42, 0.12)',
    inputBorderColor: 'rgba(14, 27, 42, 0.12)',
    successColor: '#22C55E',
    errorColor: '#EF4444',
    warningColor: '#F59E0B',
    connectingColor: '#2F8FE0',
    waveformColor: '#2F8FE0',
    speakingIndicatorColor: '#2F8FE0',
    radius: 'lg',
    shadow: 'xl',
    density: 'comfortable',
  },

  typography: {
    fontFamily: "'Figtree', sans-serif",
    headingWeight: 600,
    bodyWeight: 400,
    fontSizeScale: 'md',
    lineHeight: '1.5',
  },

  launcher: {
    variant: 'icon',
    icon: 'phone',
    iconSize: 24,
    iconColor: '#FFFFFF',
    customIconPath: undefined,
    logoSrc: undefined,
    position: 'bottom-right',
    offset: {
      bottom: 24,
      right: 24,
    },
    size: 'medium',
    shape: 'circle',
    shadow: 'medium',
    border: {
      enabled: false,
      width: 1,
      color: 'rgba(14,27,42,0.1)',
    },
    label: {
      show: false,
      text: 'Talk to Agent',
      position: 'left',
    },
    zIndex: 1000,
    pulseAnimation: true,
    tooltip: 'Talk to Agent',
    ariaLabel: 'Open AI assistant',
  },

  panel: {
    width: 360,
    maxWidth: '100vw',
    height: 'auto',
    maxHeight: 400,
    borderRadius: undefined,
    padding: undefined,
    border: undefined,
    shadow: undefined,
    position: 'bottom-right',
    offset: {
      bottom: 96,
      right: 24,
    },
    showHeader: true,
    showCloseButton: true,
    showTabs: true,
  },

  audioVisualizer: {
    type: 'waveform',
    enabled: true,
    color: '#2F8FE0',
    intensity: 1,
    size: 100,
    animationSpeed: 1,
  },

  behavior: {
    showTranscript: true,
    showMuteButton: true,
    showEndButton: true,
    showAgentStatus: true,
    showDuration: true,
    showWaveform: true,
    allowTextChat: true,
    allowVoiceChat: true,
    allowAgentNavigation: false,
    defaultTab: 'voice',
    autoResetEndedTimeout: 5000,
    connectionTimeout: 15000,
    telemetryEnabled: true,
    maxCallDurationMinutes: 10,
    maxChatTurns: 30,
    initialSilenceTimeoutSeconds: 15,
  },

  animation: {
    launcher: 'pulse',
    panel: 'slide-up',
    speaking: 'pulse',
    duration: 250,
  },

  responsive: {
    mobileBreakpoint: 860,
    fullscreenOnMobile: false,
    mobile: {
      launcherSize: 'medium',
      bottomOffset: 16,
      horizontalOffset: 16,
      panelWidth: 'min(340px, calc(100vw - 32px))',
      panelMaxHeight: 'min(420px, 70vh)',
    },
  },
};

// -------------------------------------------------------
// Deep merge utility
// Merges source into target, preserving unspecified target
// keys. Arrays are replaced, not merged.
// -------------------------------------------------------
export function deepMerge<T extends Record<string, any>>(
  target: T,
  source?: Partial<T> | null
): T {
  if (!source) return target;
  const result = { ...target } as any;

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = (source as any)[key];

    if (
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal) &&
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result as T;
}

// -------------------------------------------------------
// Runtime validation helpers
// Invalid values are replaced with defaults + a warning.
// The widget never crashes due to bad configuration.
// -------------------------------------------------------

const VALID_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
const VALID_MODES = ['floating', 'inline'] as const;
const VALID_ICONS = ['phone', 'microphone', 'headset', 'message', 'chat', 'sparkles', 'custom'] as const;
const VALID_SHAPES = ['circle', 'rounded', 'square', 'pill'] as const;
const VALID_VARIANTS = ['icon', 'icon-label', 'pill'] as const;
const VALID_VISUALIZERS = ['none', 'pulse', 'waveform', 'bars', 'orb'] as const;
const VALID_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
const VALID_AVATAR_SHAPES = ['circle', 'rounded', 'square'] as const;

function warn(field: string, value: unknown, fallback: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[VoiceWidget] Invalid value "${value}" for "${field}". Falling back to "${fallback}".`
    );
  }
}

function validateConfig(config: VoiceWidgetConfig): VoiceWidgetConfig {
  const def = defaultVoiceWidgetConfig;
  const result = { ...config };

  // mode
  if (result.mode && !VALID_MODES.includes(result.mode as any)) {
    warn('mode', result.mode, def.mode);
    result.mode = def.mode;
  }

  // launcher.position
  if (!VALID_POSITIONS.includes(result.launcher?.position as any)) {
    warn('launcher.position', result.launcher?.position, def.launcher.position);
    result.launcher = { ...result.launcher, position: def.launcher.position };
  }

  // launcher.icon
  if (!VALID_ICONS.includes(result.launcher?.icon as any)) {
    warn('launcher.icon', result.launcher?.icon, def.launcher.icon);
    result.launcher = { ...result.launcher, icon: def.launcher.icon };
  }

  // launcher.shape
  if (!VALID_SHAPES.includes(result.launcher?.shape as any)) {
    warn('launcher.shape', result.launcher?.shape, def.launcher.shape);
    result.launcher = { ...result.launcher, shape: def.launcher.shape };
  }

  // launcher.variant
  if (!VALID_VARIANTS.includes(result.launcher?.variant as any)) {
    warn('launcher.variant', result.launcher?.variant, def.launcher.variant);
    result.launcher = { ...result.launcher, variant: def.launcher.variant };
  }

  // launcher.zIndex
  if (typeof result.launcher?.zIndex !== 'number' || result.launcher.zIndex < 0) {
    warn('launcher.zIndex', result.launcher?.zIndex, def.launcher.zIndex);
    result.launcher = { ...result.launcher, zIndex: def.launcher.zIndex };
  }

  // panel.position
  if (result.panel?.position && !VALID_POSITIONS.includes(result.panel.position as any)) {
    warn('panel.position', result.panel.position, def.panel.position);
    result.panel = { ...result.panel, position: def.panel.position };
  }

  // audioVisualizer.type
  if (!VALID_VISUALIZERS.includes(result.audioVisualizer?.type as any)) {
    warn('audioVisualizer.type', result.audioVisualizer?.type, def.audioVisualizer.type);
    result.audioVisualizer = { ...result.audioVisualizer, type: def.audioVisualizer.type };
  }

  // theme.density
  if (!VALID_DENSITIES.includes(result.theme?.density as any)) {
    warn('theme.density', result.theme?.density, def.theme.density);
    result.theme = { ...result.theme, density: def.theme.density };
  }

  // avatar.shape
  if (
    result.avatar?.enabled &&
    result.avatar?.shape &&
    !VALID_AVATAR_SHAPES.includes(result.avatar.shape as any)
  ) {
    warn('avatar.shape', result.avatar.shape, 'circle');
    result.avatar = { ...result.avatar, shape: 'circle' };
  }

  // behavior.defaultTab
  if (!['voice', 'text'].includes(result.behavior?.defaultTab)) {
    warn('behavior.defaultTab', result.behavior?.defaultTab, def.behavior.defaultTab);
    result.behavior = { ...result.behavior, defaultTab: def.behavior.defaultTab };
  }

  return result;
}

import { clientRegistry } from './registry';

// -------------------------------------------------------
// Client registry — maps clientId → config partial
// -------------------------------------------------------
type ClientRegistry = Record<string, ClientVoiceWidgetConfig>;

let _registry: ClientRegistry = {};

/**
 * Register client configurations at app startup.
 * Called once in the app bootstrap (e.g. layout.tsx or a provider).
 */
export function registerClientConfigs(registry: ClientRegistry): void {
  _registry = registry;
}

/**
 * Load, merge, and validate a final VoiceWidgetConfig.
 *
 * Precedence (lowest → highest):
 *   default → client → page overrides
 *
 * @param clientId  - key registered via registry.ts or registerClientConfigs()
 * @param overrides - optional page-level overrides (e.g. mode: 'inline')
 *
 * @returns A fully validated, merged VoiceWidgetConfig.
 *          Never throws — invalid values fall back to defaults.
 */
export function getVoiceWidgetConfig(
  clientId: string,
  overrides?: Partial<VoiceWidgetConfig>
): VoiceWidgetConfig {
  try {
    const key = clientId.toLowerCase();
    const clientConfig = clientRegistry[key] || _registry[clientId] || {};
    const step1 = deepMerge(defaultVoiceWidgetConfig, clientConfig as Partial<VoiceWidgetConfig>);
    const step2 = deepMerge(step1, overrides);
    return validateConfig(step2);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[VoiceWidget] getVoiceWidgetConfig failed, using defaults.', err);
    }
    return validateConfig(deepMerge(defaultVoiceWidgetConfig, overrides));
  }
}

/**
 * Convenience: build a config from an inline partial without
 * using the registry. Useful for page-level one-off configs.
 *
 * Precedence: default → config → overrides
 */
export function buildVoiceWidgetConfig(
  config?: ClientVoiceWidgetConfig,
  overrides?: Partial<VoiceWidgetConfig>
): VoiceWidgetConfig {
  try {
    const step1 = deepMerge(defaultVoiceWidgetConfig, config as Partial<VoiceWidgetConfig>);
    const step2 = deepMerge(step1, overrides);
    return validateConfig(step2);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[VoiceWidget] buildVoiceWidgetConfig failed, using defaults.', err);
    }
    return validateConfig(defaultVoiceWidgetConfig);
  }
}

export interface WidgetConfigurationRecord {
  branding: Record<string, any>;
  theme: Record<string, any>;
  typography: Record<string, any>;
  launcher: Record<string, any>;
  panel: Record<string, any>;
  call: Record<string, any>;
  chat: Record<string, any>;
  behavior: Record<string, any>;
  responsive: Record<string, any>;
}

export function toConfigurationRecord(config: VoiceWidgetConfig): WidgetConfigurationRecord {
  return {
    branding: {
      companyName: config.branding?.companyName || '',
      assistantName: config.branding?.assistantName || '',
      title: config.branding?.title || '',
      subtitle: config.branding?.subtitle || '',
      welcomeMessage: config.branding?.welcomeMessage || '',
      avatar: config.avatar || {},
    },
    theme: config.theme || {},
    typography: config.typography || {},
    launcher: config.launcher || {},
    panel: config.panel || {},
    call: {
      provider: config.provider || { provider: 'retell', agentId: '' },
      audioVisualizer: config.audioVisualizer || {},
      animation: config.animation || {},
      connectionTimeout: config.behavior?.connectionTimeout || 15000,
      autoResetEndedTimeout: config.behavior?.autoResetEndedTimeout || 5000,
      allowVoiceChat: config.behavior?.allowVoiceChat !== false,
      maxCallDurationMinutes: config.behavior?.maxCallDurationMinutes ?? 10,
    },
    chat: {
      allowTextChat: config.behavior?.allowTextChat !== false,
      defaultTab: config.behavior?.defaultTab || 'voice',
      placeholderText: config.branding?.placeholderText || '',
      agentMessageName: config.branding?.agentMessageName || '',
      userMessageName: config.branding?.userMessageName || '',
      maxChatTurns: config.behavior?.maxChatTurns ?? 30,
    },
    behavior: {
      showTranscript: config.behavior?.showTranscript !== false,
      showMuteButton: config.behavior?.showMuteButton !== false,
      showEndButton: config.behavior?.showEndButton !== false,
      showAgentStatus: config.behavior?.showAgentStatus !== false,
      showDuration: config.behavior?.showDuration !== false,
      showWaveform: config.behavior?.showWaveform !== false,
      allowAgentNavigation: config.behavior?.allowAgentNavigation === true,
      telemetryEnabled: config.behavior?.telemetryEnabled !== false,
      installationType: config.behavior?.installationType || 'javascript',
      maxCallDurationMinutes: config.behavior?.maxCallDurationMinutes ?? 10,
      maxChatTurns: config.behavior?.maxChatTurns ?? 30,
      initialSilenceTimeoutSeconds: config.behavior?.initialSilenceTimeoutSeconds ?? 15,
    },
    responsive: config.responsive || {},
  };
}

export function fromConfigurationRecord(record: WidgetConfigurationRecord): VoiceWidgetConfig {
  return {
    mode: 'floating',
    provider: record.call?.provider || { provider: 'retell', agentId: '' },
    branding: {
      companyName: record.branding?.companyName || 'MyFrontDesk',
      assistantName: record.branding?.assistantName || 'AI Front Desk Agent',
      title: record.branding?.title || 'Talk to our AI Agent',
      subtitle: record.branding?.subtitle || 'Experience the virtual front desk receptionist live in your browser.',
      welcomeMessage: record.branding?.welcomeMessage || 'Hi! I\'m your AI front desk receptionist. How can I help you today?',
      startLabel: 'Start Conversation',
      connectingLabel: 'Connecting...',
      connectedLabel: "You're connected",
      endLabel: 'End Call',
      retryLabel: 'Try Again',
      muteLabel: 'Mute',
      unmuteLabel: 'Unmute',
      errorMessage: 'Unable to connect. Please check your connection and try again.',
      callEndedMessage: 'The call has ended. Thank you!',
      placeholderText: record.chat?.placeholderText || 'Type your message...',
      agentMessageName: record.chat?.agentMessageName || 'Agent',
      userMessageName: record.chat?.userMessageName || 'You',
    },
    avatar: record.branding?.avatar || {
      enabled: false,
      src: undefined,
      fallbackText: undefined,
      size: 44,
      shape: 'circle',
    },
    theme: record.theme as any,
    typography: record.typography as any,
    launcher: record.launcher as any,
    panel: record.panel as any,
    audioVisualizer: record.call?.audioVisualizer as any,
    behavior: {
      showTranscript: !!record.behavior?.showTranscript,
      showMuteButton: !!record.behavior?.showMuteButton,
      showEndButton: !!record.behavior?.showEndButton,
      showAgentStatus: !!record.behavior?.showAgentStatus,
      showDuration: !!record.behavior?.showDuration,
      showWaveform: !!record.behavior?.showWaveform,
      allowAgentNavigation: !!record.behavior?.allowAgentNavigation,
      allowTextChat: !!record.chat?.allowTextChat,
      allowVoiceChat: !!record.call?.allowVoiceChat,
      defaultTab: record.chat?.defaultTab || 'voice',
      autoResetEndedTimeout: record.call?.autoResetEndedTimeout || 5000,
      connectionTimeout: record.call?.connectionTimeout || 15000,
      telemetryEnabled: !!record.behavior?.telemetryEnabled,
      installationType: record.behavior?.installationType || 'javascript',
      maxCallDurationMinutes: (record.behavior as any)?.maxCallDurationMinutes ?? (record.call as any)?.maxCallDurationMinutes ?? 10,
      maxChatTurns: (record.behavior as any)?.maxChatTurns ?? (record.chat as any)?.maxChatTurns ?? 30,
      initialSilenceTimeoutSeconds: (record.behavior as any)?.initialSilenceTimeoutSeconds ?? (record.call as any)?.initialSilenceTimeoutSeconds ?? 15,
    },
    animation: record.call?.animation || {
      launcher: 'pulse',
      panel: 'slide-up',
      speaking: 'pulse',
      duration: 250,
    },
    responsive: record.responsive as any,
  };
}

